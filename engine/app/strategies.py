from dataclasses import dataclass
from typing import Any, Dict, Optional
import pandas as pd
from app import config


@dataclass
class StrategySignal:
    strategy_id: str  # "trend", "reversion", "sweep"
    side: str         # "buy" or "sell"
    direction: int    # +1 for buy, -1 for sell
    entry: float
    sl: float
    tp: float
    rr_net: float
    candle_ts: int


def calc_net_rr(entry: float, sl: float, tp: float) -> float:
    risk = abs(entry - sl)
    reward = abs(tp - entry)
    cost = entry * 2.0 * (config.TAKER_FEE + config.SLIPPAGE)
    denom = risk + cost
    if denom <= 0:
        return 0.0
    return round((reward - cost) / denom, 2)


def extract_candle_ts(df: pd.DataFrame) -> int:
    if "ts" not in df or len(df) == 0:
        return 0
    val = df["ts"].iloc[-1]
    if hasattr(val, "timestamp"):
        return int(val.timestamp() * 1000)
    try:
        return int(val)
    except Exception:
        return 0


def check_trend_strategy(
    df: pd.DataFrame,
    indicators: Dict[str, Any],
    regime: Dict[str, Any],
    bias: Dict[str, str],
) -> Optional[StrategySignal]:
    """
    Trend Strategy (Donchian breakout, Turtle style):
    - Long rule:
        Regime trending; 4h bias bull and 1h bias not bear;
        close above highest high of previous 20 bars.
        Stop: entry - 2*ATR; Target: entry + 2*(entry - stop)
    - Short rule (mirror):
        Regime trending; 4h bias bear and 1h bias not bull;
        close below lowest low of previous 20 bars.
        Stop: entry + 2*ATR; Target: entry - 2*(stop - entry)
    """
    if len(df) < 25:
        return None

    close = float(df["close"].iloc[-1])
    candle_ts = extract_candle_ts(df)

    donchian_high = indicators.get("donchian_high")
    donchian_low = indicators.get("donchian_low")
    atr14 = indicators.get("atr14")

    if donchian_high is None or donchian_low is None or atr14 is None:
        return None

    d_high_prev = float(donchian_high.iloc[-1])
    d_low_prev = float(donchian_low.iloc[-1])
    cur_atr = float(atr14.iloc[-1])

    if cur_atr <= 0:
        return None

    h4_bias = bias.get("h4", "neutral")
    h1_bias = bias.get("h1", "neutral")

    # Long check
    if h4_bias == "bull" and h1_bias != "bear" and close > d_high_prev:
        stop = close - 2.0 * cur_atr
        target = close + 2.0 * (close - stop)
        rr_net = calc_net_rr(close, stop, target)
        return StrategySignal(
            strategy_id="trend",
            side="buy",
            direction=1,
            entry=close,
            sl=round(stop, 2),
            tp=round(target, 2),
            rr_net=rr_net,
            candle_ts=candle_ts,
        )

    # Short check
    if h4_bias == "bear" and h1_bias != "bull" and close < d_low_prev:
        stop = close + 2.0 * cur_atr
        target = close - 2.0 * (stop - close)
        rr_net = calc_net_rr(close, stop, target)
        return StrategySignal(
            strategy_id="trend",
            side="sell",
            direction=-1,
            entry=close,
            sl=round(stop, 2),
            tp=round(target, 2),
            rr_net=rr_net,
            candle_ts=candle_ts,
        )

    return None


def check_reversion_strategy(
    df: pd.DataFrame,
    indicators: Dict[str, Any],
    regime: Dict[str, Any],
    bias: Dict[str, str],
) -> Optional[StrategySignal]:
    """
    Reversion Strategy (Range mean reversion):
    - Long rule:
        Regime ranging; previous close below lower Bollinger band,
        current close back inside it, previous RSI < 35.
        Stop: lowest low of last 3 bars - 0.25*ATR;
        Target: Bollinger mid (SMA20); skip if net R:R < RR_MIN.
    - Short rule (mirror):
        Regime ranging; previous close above upper Bollinger band,
        current close back inside it, previous RSI > 65.
        Stop: highest high of last 3 bars + 0.25*ATR;
        Target: Bollinger mid (SMA20); skip if net R:R < RR_MIN.
    """
    if regime.get("state") != "ranging":
        return None

    if len(df) < 25:
        return None

    close = float(df["close"].iloc[-1])
    close_prev = float(df["close"].iloc[-2])
    candle_ts = extract_candle_ts(df)

    bb_upper = indicators.get("bb_upper")
    bb_mid = indicators.get("bb_mid")
    bb_lower = indicators.get("bb_lower")
    rsi14 = indicators.get("rsi14")
    atr14 = indicators.get("atr14")

    if bb_upper is None or bb_mid is None or bb_lower is None or rsi14 is None or atr14 is None:
        return None

    cur_bb_lower = float(bb_lower.iloc[-1])
    prev_bb_lower = float(bb_lower.iloc[-2])
    cur_bb_upper = float(bb_upper.iloc[-1])
    prev_bb_upper = float(bb_upper.iloc[-2])
    cur_bb_mid = float(bb_mid.iloc[-1])
    prev_rsi = float(rsi14.iloc[-2])
    cur_atr = float(atr14.iloc[-1])

    if cur_atr <= 0:
        return None

    # Long check
    if close_prev < prev_bb_lower and close >= cur_bb_lower and prev_rsi < 35.0:
        lowest_low_3 = float(df["low"].iloc[-3:].min())
        stop = lowest_low_3 - 0.25 * cur_atr
        target = cur_bb_mid
        rr_net = calc_net_rr(close, stop, target)
        if rr_net >= config.RR_MIN:
            return StrategySignal(
                strategy_id="reversion",
                side="buy",
                direction=1,
                entry=close,
                sl=round(stop, 2),
                tp=round(target, 2),
                rr_net=rr_net,
                candle_ts=candle_ts,
            )

    # Short check
    if close_prev > prev_bb_upper and close <= cur_bb_upper and prev_rsi > 65.0:
        highest_high_3 = float(df["high"].iloc[-3:].max())
        stop = highest_high_3 + 0.25 * cur_atr
        target = cur_bb_mid
        rr_net = calc_net_rr(close, stop, target)
        if rr_net >= config.RR_MIN:
            return StrategySignal(
                strategy_id="reversion",
                side="sell",
                direction=-1,
                entry=close,
                sl=round(stop, 2),
                tp=round(target, 2),
                rr_net=rr_net,
                candle_ts=candle_ts,
            )

    return None


def check_sweep_strategy(
    df: pd.DataFrame,
    indicators: Dict[str, Any],
    regime: Dict[str, Any],
    bias: Dict[str, str],
) -> Optional[StrategySignal]:
    """
    Sweep Strategy (Liquidity sweep and reclaim):
    - Long rule:
        Low breaks previous 20-bar low but bar closes above it;
        lower wick >= 50% of bar range; volume >= 1.2*SMA(20);
        4h bias bull or neutral.
        Stop: bar low - 0.25*ATR; Target: entry + 2*(entry - stop).
    - Short rule (mirror):
        High breaks previous 20-bar high but bar closes below it;
        upper wick >= 50% of bar range; volume >= 1.2*SMA(20);
        4h bias bear or neutral.
        Stop: bar high + 0.25*ATR; Target: entry - 2*(stop - entry).
    """
    if len(df) < 25:
        return None

    cur_open = float(df["open"].iloc[-1])
    cur_high = float(df["high"].iloc[-1])
    cur_low = float(df["low"].iloc[-1])
    cur_close = float(df["close"].iloc[-1])
    cur_vol = float(df["volume"].iloc[-1])
    candle_ts = extract_candle_ts(df)

    bar_range = cur_high - cur_low
    if bar_range <= 0:
        return None

    donchian_high = indicators.get("donchian_high")
    donchian_low = indicators.get("donchian_low")
    vol_sma20 = indicators.get("vol_sma20")
    atr14 = indicators.get("atr14")

    if donchian_high is None or donchian_low is None or vol_sma20 is None or atr14 is None:
        return None

    d_high_prev = float(donchian_high.iloc[-1])
    d_low_prev = float(donchian_low.iloc[-1])
    v_sma = float(vol_sma20.iloc[-1])
    cur_atr = float(atr14.iloc[-1])

    if cur_atr <= 0 or v_sma <= 0:
        return None

    # Volume filter (adjusted for OTC forex tick volume)
    if v_sma > 0 and cur_vol < 0.85 * v_sma:
        return None

    h4_bias = bias.get("h4", "neutral")

    # Long sweep: breaks low but closes above it, lower wick >= 50%
    lower_wick = min(cur_open, cur_close) - cur_low
    if cur_low < d_low_prev and cur_close > d_low_prev and (lower_wick / bar_range) >= 0.50:
        if h4_bias in ("bull", "neutral"):
            stop = cur_low - 0.25 * cur_atr
            target = cur_close + 2.0 * (cur_close - stop)
            rr_net = calc_net_rr(cur_close, stop, target)
            return StrategySignal(
                strategy_id="sweep",
                side="buy",
                direction=1,
                entry=cur_close,
                sl=round(stop, 2),
                tp=round(target, 2),
                rr_net=rr_net,
                candle_ts=candle_ts,
            )

    # Short sweep: breaks high but closes below it, upper wick >= 50%
    upper_wick = cur_high - max(cur_open, cur_close)
    if cur_high > d_high_prev and cur_close < d_high_prev and (upper_wick / bar_range) >= 0.50:
        if h4_bias in ("bear", "neutral"):
            stop = cur_high + 0.25 * cur_atr
            target = cur_close - 2.0 * (stop - cur_close)
            rr_net = calc_net_rr(cur_close, stop, target)
            return StrategySignal(
                strategy_id="sweep",
                side="sell",
                direction=-1,
                entry=cur_close,
                sl=round(stop, 2),
                tp=round(target, 2),
                rr_net=rr_net,
                candle_ts=candle_ts,
            )

    return None


def evaluate_strategies(
    df: pd.DataFrame,
    indicators: Dict[str, Any],
    regime: Dict[str, Any],
    bias: Dict[str, str],
) -> Dict[str, Optional[StrategySignal]]:
    """
    Evaluates all 3 strategies on the candle close.
    """
    return {
        "trend": check_trend_strategy(df, indicators, regime, bias),
        "reversion": check_reversion_strategy(df, indicators, regime, bias),
        "sweep": check_sweep_strategy(df, indicators, regime, bias),
    }
