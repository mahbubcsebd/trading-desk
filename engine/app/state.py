import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
import pandas as pd
from app import config


@dataclass
class InstrumentRule:
    tick_size: float = 0.01
    qty_step: float = 0.001
    min_order_qty: float = 0.001


@dataclass
class SymbolState:
    symbol: str
    instrument: InstrumentRule = field(default_factory=InstrumentRule)
    # Candles dictionary mapping tf -> list of [ts, o, h, l, c, v] oldest first
    candles: Dict[str, List[List[float]]] = field(default_factory=lambda: {tf: [] for tf in config.CHART_TFS})
    price: float = 0.0
    change_24h_pct: float = 0.0
    last_msg_ts: float = 0.0
    regime: Dict[str, Any] = field(default_factory=lambda: {"state": "ranging", "volatility": "normal", "adx": 0.0})
    bias: Dict[str, str] = field(default_factory=lambda: {"h4": "neutral", "h1": "neutral"})
    liquidity_tracker: Optional[Any] = None
    current_setup: Optional[Dict[str, Any]] = None
    strategies_summary: List[Dict[str, Any]] = field(default_factory=lambda: [
        {"id": "trend", "state": "idle", "enabled": False, "oosProfitFactor": 0.0},
        {"id": "reversion", "state": "idle", "enabled": False, "oosProfitFactor": 0.0},
        {"id": "sweep", "state": "idle", "enabled": False, "oosProfitFactor": 0.0},
    ])
    daily_limit_hit: bool = False
    current_atr: float = 0.0

    def __post_init__(self):
        from app.liquidity import SymbolLiquidityTracker
        self.liquidity_tracker = SymbolLiquidityTracker(symbol=self.symbol)

    @property
    def is_fresh(self) -> bool:
        if self.last_msg_ts <= 0:
            return False
        return (time.time() - self.last_msg_ts) <= 10.0

    def recompute_context(self) -> None:
        """Recomputes regime and bias based on 1h and 4h dataframes."""
        try:
            from app.regime import calc_market_context
            df_1h = self.get_dataframe("1h")
            df_4h = self.get_dataframe("4h")
            ctx = calc_market_context(df_1h, df_4h)
            self.regime = ctx["regime"]
            self.bias = ctx["bias"]
        except Exception:
            pass

    def recompute_setup(self) -> None:
        """Evaluates strategies and scoring on 15m candle close."""
        try:
            from app.indicators import calc_indicators
            from app.strategies import evaluate_strategies
            from app.scoring import evaluate_best_setup, get_backtest_strategy_info
            from app.signals import log_signal
            from app.db import get_settings, check_daily_limit_hit

            df_15m = self.get_dataframe(config.ENTRY_TF)
            if len(df_15m) < 25:
                return

            inds = calc_indicators(df_15m)
            signals = evaluate_strategies(df_15m, inds, self.regime, self.bias)
            backtest_info = get_backtest_strategy_info(self.symbol)
            settings = get_settings()

            balance = float(settings.get("balance", "10000.0"))
            risk_pct = float(settings.get("risk_pct", "1.0"))
            daily_limit_pct = float(settings.get("daily_limit_pct", "3.0"))

            self.daily_limit_hit = check_daily_limit_hit(balance, daily_limit_pct)

            candle_ts = int(df_15m["ts"].iloc[-1].timestamp() * 1000)
            candle_open = float(df_15m["open"].iloc[-1])
            self.current_atr = float(inds["atr14"].iloc[-1]) if inds.get("atr14") is not None and not inds["atr14"].empty else 0.0

            liq_metrics = (
                self.liquidity_tracker.get_metrics(self.price)
                if self.liquidity_tracker
                else {
                    "bookImbalance": 0.0,
                    "buyWall": None,
                    "sellWall": None,
                    "takerBuyPct": 50.0,
                    "oiChange15mPct": 0.0,
                    "funding": 0.0,
                    "liq5m": {"longUsd": 0.0, "shortUsd": 0.0},
                }
            )

            setup, strategies_summary = evaluate_best_setup(
                symbol=self.symbol,
                signals=signals,
                backtest_info=backtest_info,
                bias=self.bias,
                regime=self.regime,
                liquidity=liq_metrics,
                price=self.price,
                candle_open=candle_open,
                candle_ts=candle_ts,
                is_fresh=self.is_fresh,
                daily_limit_hit=self.daily_limit_hit,
                balance=balance,
                risk_pct=risk_pct,
                qty_step=self.instrument.qty_step,
                min_order_qty=self.instrument.min_order_qty,
                current_atr=self.current_atr,
            )

            self.current_setup = setup
            self.strategies_summary = strategies_summary

            if setup.get("action") in ("BUY", "SELL"):
                log_signal(
                    symbol=self.symbol,
                    strategy=setup["strategy"],
                    side=setup["action"],
                    entry=setup["entry"],
                    sl=setup["sl"],
                    tp=setup["tp"],
                    score=setup["score"],
                    created_at=candle_ts,
                )
        except Exception:
            pass

    def set_candles(self, tf: str, candle_list: List[List[float]]) -> None:
        """Set history bars, keeping at most HISTORY_BARS[tf]."""
        max_bars = config.HISTORY_BARS.get(tf, 1000)
        if len(candle_list) > max_bars:
            self.candles[tf] = candle_list[-max_bars:]
        else:
            self.candles[tf] = list(candle_list)
        if self.candles[tf] and tf == config.ENTRY_TF:
            self.price = float(self.candles[tf][-1][4])
        if tf in ("1h", "4h"):
            self.recompute_context()
        if tf == config.ENTRY_TF:
            self.recompute_setup()

    def update_candle(
        self, tf: str, start: int, o: float, h: float, l: float, c: float, v: float, confirm: bool
    ) -> Optional[Tuple[str, str, int, float, float, float, float, float]]:
        """
        Updates live candle. Returns (symbol, tf, start, o, h, l, c, v) if confirm is True for DB storage.
        """
        self.last_msg_ts = time.time()
        self.price = c
        candle_list = self.candles.setdefault(tf, [])
        new_bar = [start, o, h, l, c, v]

        if candle_list and candle_list[-1][0] == start:
            # Update currently open candle
            candle_list[-1] = new_bar
        else:
            # Append new candle
            candle_list.append(new_bar)
            max_bars = config.HISTORY_BARS.get(tf, 1000)
            if len(candle_list) > max_bars:
                self.candles[tf] = candle_list[-max_bars:]

        if tf in ("1h", "4h"):
            self.recompute_context()

        if confirm and tf == config.ENTRY_TF:
            try:
                from app.signals import update_open_signals_on_candle
                update_open_signals_on_candle(self.symbol, start, o, h, l, c)
            except Exception:
                pass
            self.recompute_setup()

        if confirm:
            return (self.symbol, tf, start, o, h, l, c, v)
        return None

    def get_candles(self, tf: str, limit: int = 500) -> List[List[float]]:
        candle_list = self.candles.get(tf, [])
        if limit and len(candle_list) > limit:
            return candle_list[-limit:]
        return list(candle_list)

    def get_dataframe(self, tf: str) -> pd.DataFrame:
        data = self.candles.get(tf, [])
        if not data:
            return pd.DataFrame(columns=["ts", "open", "high", "low", "close", "volume"])
        df = pd.DataFrame(data, columns=["ts", "open", "high", "low", "close", "volume"])
        df["ts"] = pd.to_datetime(df["ts"], unit="ms")
        return df


class AppState:
    def __init__(self):
        self.symbols: Dict[str, SymbolState] = {
            s: SymbolState(symbol=s) for s in config.SYMBOLS
        }

    def get_symbol(self, symbol: str) -> Optional[SymbolState]:
        return self.symbols.get(symbol.upper())

    def is_fresh(self, symbol: str) -> bool:
        s = self.get_symbol(symbol)
        return s.is_fresh if s else False

    def get_snapshot(self, symbol: str, tf: str = "15m") -> Dict[str, Any]:
        sym = symbol.upper()
        sym_state = self.get_symbol(sym)
        now_ms = int(time.time() * 1000)

        if not sym_state:
            return {
                "symbol": sym,
                "ts": now_ms,
                "fresh": False,
                "price": 0.0,
                "change24hPct": 0.0,
                "regime": {"state": "ranging", "volatility": "normal", "adx": 0.0},
                "bias": {"h4": "neutral", "h1": "neutral"},
                "setup": {
                    "action": "WAIT",
                    "score": 0,
                    "strategy": None,
                    "entry": 0.0,
                    "sl": 0.0,
                    "tp": 0.0,
                    "rr": 0.0,
                    "qty": 0.0,
                    "riskUsd": 0.0,
                    "reasons": [],
                    "waitReason": "Unknown symbol",
                    "validUntil": 0,
                },
                "liquidity": {
                    "bookImbalance": 0.0,
                    "buyWall": None,
                    "sellWall": None,
                    "takerBuyPct": 50.0,
                    "oiChange15mPct": 0.0,
                    "funding": 0.0,
                    "liq5m": {"longUsd": 0.0, "shortUsd": 0.0},
                },
                "strategies": [
                    {"id": "trend", "state": "idle", "enabled": False, "oosProfitFactor": 0.0},
                    {"id": "reversion", "state": "idle", "enabled": False, "oosProfitFactor": 0.0},
                    {"id": "sweep", "state": "idle", "enabled": False, "oosProfitFactor": 0.0},
                ],
                "candle": {"tf": tf, "t": now_ms, "o": 0.0, "h": 0.0, "l": 0.0, "c": 0.0, "v": 0.0},
                "dailyLimitHit": False,
            }

        candle_list = sym_state.candles.get(tf, [])
        if candle_list:
            last = candle_list[-1]
            candle_obj = {
                "tf": tf,
                "t": int(last[0]),
                "o": float(last[1]),
                "h": float(last[2]),
                "l": float(last[3]),
                "c": float(last[4]),
                "v": float(last[5]),
            }
            price = sym_state.price if sym_state.price > 0 else float(last[4])
        else:
            candle_obj = {"tf": tf, "t": now_ms, "o": 0.0, "h": 0.0, "l": 0.0, "c": 0.0, "v": 0.0}
            price = sym_state.price

        liq_metrics = (
            sym_state.liquidity_tracker.get_metrics(price)
            if sym_state.liquidity_tracker
            else {
                "bookImbalance": 0.0,
                "buyWall": None,
                "sellWall": None,
                "takerBuyPct": 50.0,
                "oiChange15mPct": 0.0,
                "funding": 0.0,
                "liq5m": {"longUsd": 0.0, "shortUsd": 0.0},
            }
        )

        setup = sym_state.current_setup
        if not setup:
            setup = {
                "action": "WAIT",
                "score": 0,
                "strategy": None,
                "entry": 0.0,
                "sl": 0.0,
                "tp": 0.0,
                "rr": 0.0,
                "qty": 0.0,
                "riskUsd": 0.0,
                "reasons": [],
                "waitReason": "Initializing data feed",
                "validUntil": 0,
            }
        else:
            # Check expiration dynamically
            setup = dict(setup)
            if setup.get("action") in ("BUY", "SELL"):
                valid_until = setup.get("validUntil", 0)
                entry = setup.get("entry", 0.0)
                atr = sym_state.current_atr
                is_expired = False
                if valid_until > 0 and now_ms > valid_until:
                    is_expired = True
                elif atr > 0 and abs(price - entry) > (0.5 * atr):
                    is_expired = True

                if is_expired:
                    setup["expired"] = True

        return {
            "symbol": sym,
            "ts": now_ms,
            "fresh": sym_state.is_fresh,
            "price": price,
            "change24hPct": round(sym_state.change_24h_pct, 2),
            "regime": sym_state.regime,
            "bias": sym_state.bias,
            "setup": setup,
            "liquidity": liq_metrics,
            "strategies": sym_state.strategies_summary,
            "candle": candle_obj,
            "dailyLimitHit": sym_state.daily_limit_hit,
        }


# Global singleton in-memory state
state = AppState()

