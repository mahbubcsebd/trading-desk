import numpy as np
import pandas as pd
from typing import Dict, Any
from app import config
from app.indicators import calc_adx, calc_atr, calc_ema


def calc_regime(df_1h: pd.DataFrame) -> Dict[str, Any]:
    """
    Computes 1h Market Regime:
    - trending if ADX(14) >= ADX_TREND (22), else ranging
    - Volatility based on ATR(14) percentile over last 200 bars (<30 low, 30-70 normal, >70 high)
    """
    if df_1h is None or len(df_1h) < 20:
        return {
            "state": "ranging",
            "volatility": "normal",
            "adx": 0.0,
            "atr": 0.0,
        }

    adx_series = calc_adx(df_1h, 14)
    cur_adx = float(adx_series.iloc[-1]) if not adx_series.empty else 0.0
    state = "trending" if cur_adx >= config.ADX_TREND else "ranging"

    atr_series = calc_atr(df_1h, 14).dropna()
    if len(atr_series) >= 10:
        window = atr_series.iloc[-200:]
        cur_atr = float(atr_series.iloc[-1])
        # Percentile rank of current ATR relative to last 200 bars
        pct = float((window < cur_atr).mean() * 100.0)
        if pct < 30.0:
            volatility = "low"
        elif pct > 70.0:
            volatility = "high"
        else:
            volatility = "normal"
    else:
        volatility = "normal"
        cur_atr = float(atr_series.iloc[-1]) if not atr_series.empty else 0.0

    return {
        "state": state,
        "volatility": volatility,
        "adx": round(cur_adx, 1),
        "atr": cur_atr,
    }


def calc_bias(df: pd.DataFrame) -> str:
    """
    Bias per timeframe (1h, 4h):
    - bull if EMA50 > EMA200 and close > EMA50
    - bear if EMA50 < EMA200 and close < EMA50
    - else neutral
    """
    if df is None or len(df) < 50:
        return "neutral"

    close = df["close"]
    ema50_series = calc_ema(close, 50)
    ema200_series = calc_ema(close, min(200, len(df)))

    ema50 = float(ema50_series.iloc[-1])
    ema200 = float(ema200_series.iloc[-1])
    cur_close = float(close.iloc[-1])

    if ema50 > ema200 and cur_close > ema50:
        return "bull"
    elif ema50 < ema200 and cur_close < ema50:
        return "bear"
    return "neutral"


def calc_market_context(df_1h: pd.DataFrame, df_4h: pd.DataFrame) -> Dict[str, Any]:
    """
    Computes combined market regime (1h) and multi-timeframe bias (1h, 4h).
    """
    regime = calc_regime(df_1h)
    bias_h1 = calc_bias(df_1h)
    bias_h4 = calc_bias(df_4h)

    return {
        "regime": {
            "state": regime["state"],
            "volatility": regime["volatility"],
            "adx": regime["adx"],
        },
        "bias": {
            "h4": bias_h4,
            "h1": bias_h1,
        },
    }
