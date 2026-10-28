import argparse
import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from app import config, db
from app.bybit import BybitRestClient
from app.indicators import (
    calc_adx,
    calc_atr,
    calc_bollinger,
    calc_donchian,
    calc_ema,
    calc_rsi,
    calc_volume_sma,
)
from app.regime import calc_market_context
from app.strategies import check_reversion_strategy, check_sweep_strategy, check_trend_strategy

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("backtest")


async def backfill_candles(symbol: str, tf: str = "15m", target_bars: int = 5000) -> int:
    """
    Backfills candles from Bybit REST into SQLite database.
    """
    db.init_db()
    existing = db.get_candles(symbol, tf, limit=target_bars)
    if len(existing) >= target_bars:
        logger.info(f"{symbol} ({tf}) already has {len(existing)} bars in DB. Skipping backfill.")
        return len(existing)

    logger.info(f"Backfilling {symbol} ({tf}) towards {target_bars} bars...")
    client = BybitRestClient()
    interval = config.TF_TO_BYBIT_INTERVAL.get(tf, "15")

    current_oldest_ts = existing[0][0] if existing else None
    collected_count = len(existing)

    while collected_count < target_bars:
        limit = min(1000, target_bars - collected_count)
        url = f"{config.BYBIT_REST_BASE}/v5/market/kline?category=linear&symbol={symbol}&interval={interval}&limit={limit}"
        if current_oldest_ts:
            url += f"&end={current_oldest_ts - 1}"

        import httpx
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            resp = await http_client.get(url)
            if resp.status_code != 200:
                logger.warning(f"Failed to fetch kline batch: {resp.status_code}")
                break
            data = resp.json()
            rows = data.get("result", {}).get("list", [])
            if not rows:
                break

            batch = []
            for r in rows:
                ts = int(r[0])
                batch.append((symbol, tf, ts, float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5])))

            db.save_candles(batch)
            collected_count += len(batch)
            current_oldest_ts = min(b[2] for b in batch)
            logger.info(f"Saved {len(batch)} bars. Total: {collected_count}/{target_bars}")
            await asyncio.sleep(0.1)

    return collected_count


def calculate_metrics(trades: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not trades:
        return {
            "trades": 0,
            "win_rate": 0.0,
            "avg_r": 0.0,
            "expectancy": 0.0,
            "profit_factor": 0.0,
            "max_drawdown": 0.0,
            "total_r": 0.0,
        }

    r_multiples = [t["result_r"] for t in trades]
    wins = [r for r in r_multiples if r > 0]
    losses = [r for r in r_multiples if r < 0]

    count = len(r_multiples)
    win_count = len(wins)
    loss_count = len(losses)
    win_rate = round((win_count / count) * 100.0, 1)

    avg_r = round(float(np.mean(r_multiples)), 2)
    total_r = round(float(np.sum(r_multiples)), 2)

    avg_win_r = float(np.mean(wins)) if wins else 0.0
    avg_loss_r = abs(float(np.mean(losses))) if losses else 0.0

    win_prob = win_count / count
    loss_prob = loss_count / count
    expectancy = round((win_prob * avg_win_r) - (loss_prob * avg_loss_r), 2)

    gross_profit = float(np.sum(wins)) if wins else 0.0
    gross_loss = abs(float(np.sum(losses))) if losses else 0.0

    if gross_loss > 0:
        profit_factor = round(gross_profit / gross_loss, 2)
    elif gross_profit > 0:
        profit_factor = 99.0
    else:
        profit_factor = 0.0

    # Max Drawdown calculation in R
    cumulative = np.cumsum(r_multiples)
    running_max = np.maximum.accumulate(cumulative)
    drawdowns = running_max - cumulative
    max_drawdown = round(float(np.max(drawdowns)) if len(drawdowns) > 0 else 0.0, 2)

    return {
        "trades": count,
        "win_rate": win_rate,
        "avg_r": avg_r,
        "expectancy": expectancy,
        "profit_factor": profit_factor,
        "max_drawdown": max_drawdown,
        "total_r": total_r,
    }


def simulate_strategy(
    strategy_id: str,
    df_15m: pd.DataFrame,
    regime_series: List[Dict[str, Any]],
    bias_series: List[Dict[str, str]],
) -> List[Dict[str, Any]]:
    """
    Simulates a strategy on 15m candle history.
    - Signal evaluated at candle close i.
    - Filled at next candle i+1 Open (with slippage).
    - Stop first if both stop & target hit in same candle.
    - Forced exit after 32 bars.
    """
    trades = []
    n = len(df_15m)
    open_trade: Optional[Dict[str, Any]] = None

    # Precalculate indicators on df_15m
    close = df_15m["close"]
    volume = df_15m["volume"]

    atr14 = calc_atr(df_15m, 14)
    rsi14 = calc_rsi(close, 14)
    bb_upper, bb_mid, bb_lower = calc_bollinger(close, 20, 2.0)
    d_high, _, d_low = calc_donchian(df_15m, 20)
    vol_sma = calc_volume_sma(volume, 20)

    # Start loop after warm-up (e.g. index 50)
    for i in range(50, n - 1):
        bar_close_time = int(df_15m["ts"].iloc[i])

        # 1. Manage open trade
        if open_trade is not None:
            entry_idx = open_trade["entry_idx"]
            bars_held = i - entry_idx
            high = float(df_15m["high"].iloc[i])
            low = float(df_15m["low"].iloc[i])
            close_price = float(df_15m["close"].iloc[i])

            side = open_trade["side"]
            entry_price = open_trade["fill_entry"]
            stop = open_trade["sl"]
            target = open_trade["tp"]
            initial_risk = open_trade["initial_risk"]

            closed = False
            exit_price = 0.0

            if side == "buy":
                hit_stop = low <= stop
                hit_target = high >= target

                # Stop-first rule if both hit in same candle
                if hit_stop and hit_target:
                    exit_price = stop * (1.0 - config.SLIPPAGE)
                    closed = True
                elif hit_stop:
                    exit_price = stop * (1.0 - config.SLIPPAGE)
                    closed = True
                elif hit_target:
                    exit_price = target * (1.0 - config.SLIPPAGE)
                    closed = True
                elif bars_held >= config.SIGNAL_EXPIRY_BARS:
                    exit_price = close_price * (1.0 - config.SLIPPAGE)
                    closed = True

                if closed:
                    # Fee on both sides
                    fee = (entry_price + exit_price) * config.TAKER_FEE
                    net_pnl = (exit_price - entry_price) - fee
                    result_r = round(net_pnl / initial_risk, 2)
                    trades.append({
                        "entry_ts": open_trade["entry_ts"],
                        "exit_ts": bar_close_time,
                        "side": side,
                        "entry": entry_price,
                        "exit": exit_price,
                        "result_r": result_r,
                    })
                    open_trade = None

            elif side == "sell":
                hit_stop = high >= stop
                hit_target = low <= target

                # Stop-first rule if both hit in same candle
                if hit_stop and hit_target:
                    exit_price = stop * (1.0 + config.SLIPPAGE)
                    closed = True
                elif hit_stop:
                    exit_price = stop * (1.0 + config.SLIPPAGE)
                    closed = True
                elif hit_target:
                    exit_price = target * (1.0 + config.SLIPPAGE)
                    closed = True
                elif bars_held >= config.SIGNAL_EXPIRY_BARS:
                    exit_price = close_price * (1.0 + config.SLIPPAGE)
                    closed = True

                if closed:
                    fee = (entry_price + exit_price) * config.TAKER_FEE
                    net_pnl = (entry_price - exit_price) - fee
                    result_r = round(net_pnl / initial_risk, 2)
                    trades.append({
                        "entry_ts": open_trade["entry_ts"],
                        "exit_ts": bar_close_time,
                        "side": side,
                        "entry": entry_price,
                        "exit": exit_price,
                        "result_r": result_r,
                    })
                    open_trade = None

        # 2. If no open trade, check signal at bar i close
        if open_trade is None and i < n - 1:
            slice_df = df_15m.iloc[: i + 1]
            inds = {
                "donchian_high": d_high.iloc[: i + 1],
                "donchian_low": d_low.iloc[: i + 1],
                "atr14": atr14.iloc[: i + 1],
                "bb_upper": bb_upper.iloc[: i + 1],
                "bb_mid": bb_mid.iloc[: i + 1],
                "bb_lower": bb_lower.iloc[: i + 1],
                "rsi14": rsi14.iloc[: i + 1],
                "vol_sma20": vol_sma.iloc[: i + 1],
            }
            regime = regime_series[i]
            bias = bias_series[i]

            signal = None
            if strategy_id == "trend":
                signal = check_trend_strategy(slice_df, inds, regime, bias)
            elif strategy_id == "reversion":
                signal = check_reversion_strategy(slice_df, inds, regime, bias)
            elif strategy_id == "sweep":
                signal = check_sweep_strategy(slice_df, inds, regime, bias)

            if signal is not None:
                # Next candle Open fill (bar i+1)
                next_open = float(df_15m["open"].iloc[i + 1])
                next_ts = int(df_15m["ts"].iloc[i + 1])

                if signal.side == "buy":
                    fill_entry = next_open * (1.0 + config.SLIPPAGE)
                    initial_risk = abs(fill_entry - signal.sl)
                else:
                    fill_entry = next_open * (1.0 - config.SLIPPAGE)
                    initial_risk = abs(signal.sl - fill_entry)

                if initial_risk > 0:
                    open_trade = {
                        "strategy_id": strategy_id,
                        "side": signal.side,
                        "fill_entry": fill_entry,
                        "sl": signal.sl,
                        "tp": signal.tp,
                        "initial_risk": initial_risk,
                        "entry_idx": i + 1,
                        "entry_ts": next_ts,
                    }

    return trades


def run_backtest_for_symbol(symbol: str, target_bars: int = 4000) -> List[Dict[str, Any]]:
    """
    Runs full backtest across trend, reversion, sweep on 15m history.
    Splits into 70% in-sample / 30% out-of-sample and saves to DB.
    """
    db.init_db()
    candles_15m = db.get_candles(symbol, "15m", limit=target_bars)
    candles_1h = db.get_candles(symbol, "1h", limit=target_bars // 4)
    candles_4h = db.get_candles(symbol, "4h", limit=target_bars // 16)

    if len(candles_15m) < 200:
        logger.warning(f"Not enough candles for {symbol} ({len(candles_15m)}). Please backfill first.")
        return []

    df_15m = pd.DataFrame(candles_15m, columns=["ts", "open", "high", "low", "close", "volume"])
    df_1h = pd.DataFrame(candles_1h, columns=["ts", "open", "high", "low", "close", "volume"])
    df_4h = pd.DataFrame(candles_4h, columns=["ts", "open", "high", "low", "close", "volume"])

    # Precalculate rolling regime & bias for each 15m candle using available 1h and 4h data
    regime_series = []
    bias_series = []
    for ts in df_15m["ts"]:
        sub_1h = df_1h[df_1h["ts"] <= ts]
        sub_4h = df_4h[df_4h["ts"] <= ts]
        ctx = calc_market_context(sub_1h, sub_4h)
        regime_series.append(ctx["regime"])
        bias_series.append(ctx["bias"])

    # 70% In-sample / 30% Out-of-sample split timestamp
    min_ts = df_15m["ts"].min()
    max_ts = df_15m["ts"].max()
    split_ts = min_ts + 0.70 * (max_ts - min_ts)

    results = []
    run_at_ms = int(time.time() * 1000)

    for strat_id in ["trend", "reversion", "sweep"]:
        trades = simulate_strategy(strat_id, df_15m, regime_series, bias_series)
        in_sample_trades = [t for t in trades if t["exit_ts"] <= split_ts]
        out_sample_trades = [t for t in trades if t["exit_ts"] > split_ts]

        in_sample_metrics = calculate_metrics(in_sample_trades)
        out_sample_metrics = calculate_metrics(out_sample_trades)

        # Enabling rule: out-of-sample trades >= 30, expectancy > 0, profit_factor >= 1.2
        enabled = bool(
            out_sample_metrics["trades"] >= 30
            and out_sample_metrics["expectancy"] > 0
            and out_sample_metrics["profit_factor"] >= 1.2
        )

        metrics_obj = {
            "in_sample": in_sample_metrics,
            "out_of_sample": out_sample_metrics,
        }

        # Save to DB
        conn = db.get_connection()
        try:
            conn.execute(
                """
                INSERT OR REPLACE INTO backtests (symbol, strategy, run_at, enabled, metrics_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (symbol, strat_id, run_at_ms, 1 if enabled else 0, json.dumps(metrics_obj)),
            )
            conn.commit()
        finally:
            conn.close()

        results.append({
            "symbol": symbol,
            "strategy": strat_id,
            "enabled": enabled,
            "run_at": run_at_ms,
            "in_sample": in_sample_metrics,
            "out_of_sample": out_sample_metrics,
        })

    return results


async def main():
    parser = argparse.ArgumentParser(description="TradeDesk Backtest Engine")
    parser.add_argument("--symbol", default="BTCUSDT", help="Symbol to backtest (e.g. BTCUSDT, XAUUSDT)")
    parser.add_argument("--all", action="store_true", help="Run backtest for all symbols")
    parser.add_argument("--backfill", action="store_true", help="Backfill historical candles before running")
    parser.add_argument("--bars", type=int, default=3000, help="Target bars for backtest")
    args = parser.parse_args()

    symbols = config.SYMBOLS if args.all else [args.symbol.upper()]

    for sym in symbols:
        if args.backfill:
            for tf in config.CHART_TFS:
                target = args.bars if tf == "15m" else args.bars // 4
                await backfill_candles(sym, tf=tf, target_bars=target)

        logger.info(f"Running backtest for {sym}...")
        results = run_backtest_for_symbol(sym, target_bars=args.bars)
        print(f"\n==================== BACKTEST RESULTS: {sym} ====================")
        for r in results:
            print(f"Strategy: {r['strategy'].upper()} | Enabled: {r['enabled']}")
            print(f"  In-Sample:     Trades={r['in_sample']['trades']}, WinRate={r['in_sample']['win_rate']}%, PF={r['in_sample']['profit_factor']}, Exp={r['in_sample']['expectancy']}R, DD={r['in_sample']['max_drawdown']}R")
            print(f"  Out-of-Sample: Trades={r['out_of_sample']['trades']}, WinRate={r['out_of_sample']['win_rate']}%, PF={r['out_of_sample']['profit_factor']}, Exp={r['out_of_sample']['expectancy']}R, DD={r['out_of_sample']['max_drawdown']}R")
        print("=================================================================\n")


if __name__ == "__main__":
    asyncio.run(main())
