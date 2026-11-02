"""
matrix.py — Institutional Multi-Timeframe Confluence Matrix & Heatmap Engine.
Analyzes 4H (Macro Trend), 1H (Intermediate Bias), 15m (Execution Structure), and 5m (Momentum)
across all supported instruments to identify A+ aligned setups and flag HTF/LTF divergence.
"""

import logging
from typing import Any, Dict, List
import pandas as pd

from app import config
from app.indicators import calc_ema, calc_rsi

logger = logging.getLogger("matrix")

TIMEFRAMES = ["4h", "1h", "15m", "5m"]

ASSET_CLASS_MAP = {
    "XAUUSD": "Metals",
    "BTCUSD": "Crypto",
    "EURUSD": "Forex",
    "GBPUSD": "Forex",
    "USDJPY": "Forex",
    "US30": "Indices",
    "NAS100": "Indices",
}

INSTRUMENT_NAME_MAP = {
    "XAUUSD": "Gold Spot / US Dollar",
    "BTCUSD": "Bitcoin / US Dollar",
    "EURUSD": "Euro / US Dollar",
    "GBPUSD": "British Pound / US Dollar",
    "USDJPY": "US Dollar / Japanese Yen",
    "US30": "Dow Jones 30 Index",
    "NAS100": "Nasdaq 100 Index",
}


def analyze_tf(df: pd.DataFrame, tf: str) -> Dict[str, Any]:
    """Analyzes a single timeframe for trend direction, RSI, and momentum."""
    if df is None or len(df) < 15:
        return {
            "tf": tf,
            "trend": "NEUTRAL",
            "rsi": 50.0,
            "emaStatus": "INSUFFICIENT_DATA",
            "label": "Loading Data",
        }

    close = df["close"]
    cur_close = float(close.iloc[-1])

    rsi_series = calc_rsi(close, 14)
    cur_rsi = round(float(rsi_series.iloc[-1]), 1) if not rsi_series.empty else 50.0

    ema20_series = calc_ema(close, min(20, len(df)))
    ema50_series = calc_ema(close, min(50, len(df)))

    ema20 = float(ema20_series.iloc[-1])
    ema50 = float(ema50_series.iloc[-1])

    # Trend Determination
    if cur_close > ema20 and ema20 >= ema50:
        trend = "BULLISH"
        ema_status = "ABOVE_EMA"
        if cur_rsi > 65:
            label = "Strong Bullish Expansion"
        elif cur_rsi < 45:
            label = "Bullish Pullback Discount"
        else:
            label = "Healthy Bullish Trend"
    elif cur_close < ema20 and ema20 <= ema50:
        trend = "BEARISH"
        ema_status = "BELOW_EMA"
        if cur_rsi < 35:
            label = "Strong Bearish Expansion"
        elif cur_rsi > 55:
            label = "Bearish Pullback Premium"
        else:
            label = "Healthy Bearish Trend"
    elif cur_close > ema50:
        trend = "BULLISH"
        ema_status = "ABOVE_50"
        label = "Mild Bullish Bias"
    elif cur_close < ema50:
        trend = "BEARISH"
        ema_status = "BELOW_50"
        label = "Mild Bearish Bias"
    else:
        trend = "NEUTRAL"
        ema_status = "CHOP"
        label = "Consolidation / Range"

    return {
        "tf": tf,
        "trend": trend,
        "rsi": cur_rsi,
        "emaStatus": ema_status,
        "label": label,
    }


def compute_confluence_matrix(state_obj) -> Dict[str, Any]:
    """
    Computes real-time multi-timeframe confluence for all registered instruments.
    Returns structured data for the frontend Confluence Heatmap component.
    """
    results: List[Dict[str, Any]] = []

    for sym in config.SYMBOLS:
        sym_state = state_obj.get_symbol(sym)
        if not sym_state:
            continue

        rules = config.EXNESS_INSTRUMENT_RULES.get(sym, {})
        decimals = rules.get("decimals", 2)
        price = sym_state.price

        # Analyze each timeframe
        tf_data: Dict[str, Any] = {}
        for tf in TIMEFRAMES:
            df = sym_state.get_dataframe(tf)
            tf_data[tf] = analyze_tf(df, tf)

        # Count directional alignment across 4 timeframes
        bull_count = sum(1 for tf in TIMEFRAMES if tf_data[tf]["trend"] == "BULLISH")
        bear_count = sum(1 for tf in TIMEFRAMES if tf_data[tf]["trend"] == "BEARISH")
        neutral_count = 4 - (bull_count + bear_count)

        if bull_count == 4:
            grade = "A+"
            direction = "BULLISH"
            score = 98
            badge = "A+ FULL CONFLUENCE"
            summary = "4/4 Full Alignment (4H, 1H, 15m, 5m Bullish)"
        elif bear_count == 4:
            grade = "A+"
            direction = "BEARISH"
            score = 98
            badge = "A+ FULL CONFLUENCE"
            summary = "4/4 Full Alignment (4H, 1H, 15m, 5m Bearish)"
        elif bull_count >= 3:
            grade = "A"
            direction = "BULLISH"
            score = 85
            badge = "A CONFLUENCE"
            summary = "3/4 Bullish Confluence with minor LTF pullback"
        elif bear_count >= 3:
            grade = "A"
            direction = "BEARISH"
            score = 85
            badge = "A CONFLUENCE"
            summary = "3/4 Bearish Confluence with minor LTF pullback"
        elif bull_count == 2 and bear_count == 2:
            grade = "CHOP"
            direction = "NEUTRAL"
            score = 48
            badge = "HTF / LTF DIVERGENCE"
            summary = "HTF (4H/1H) vs LTF (15m/5m) Divergence — Wait for Breakout"
        else:
            grade = "B"
            direction = "NEUTRAL"
            score = 62
            badge = "MIXED / RANGING"
            summary = "Market ranging or building orderflow consolidation"

        # SMC Context from state
        smc = getattr(sym_state, "smc", None)
        if not smc:
            try:
                from app.smc import compute_full_smc_analysis
                df_15m = sym_state.get_dataframe(config.ENTRY_TF)
                if df_15m is not None and len(df_15m) >= 15:
                    smc = compute_full_smc_analysis(
                        df_15m,
                        price,
                        decimals=decimals,
                        daily_bias=sym_state.bias.get("h4", "neutral") if hasattr(sym_state, "bias") else "neutral",
                    )
            except Exception as e:
                logger.debug("Failed computing SMC in matrix for %s: %s", sym, e)
                smc = None
        smc = smc or {}
        pd_zone = smc.get("pdZones", {}).get("currentZone", "EQUILIBRIUM")
        structure = smc.get("structure", {})
        order_blocks = smc.get("orderBlocks", {})
        has_bull_ob = bool(order_blocks.get("bullishOB", {}).get("top", 0) > 0)
        has_bear_ob = bool(order_blocks.get("bearishOB", {}).get("top", 0) > 0)

        # Setup info
        setup = sym_state.current_setup or {}
        action = setup.get("action", "WAIT")
        setup_score = setup.get("score", 0)

        results.append({
            "symbol": sym,
            "name": INSTRUMENT_NAME_MAP.get(sym, sym),
            "assetClass": ASSET_CLASS_MAP.get(sym, "Forex"),
            "price": round(price, decimals),
            "decimals": decimals,
            "alignment": {
                "grade": grade,
                "direction": direction,
                "score": score,
                "badge": badge,
                "summary": summary,
                "bullCount": bull_count,
                "bearCount": bear_count,
                "neutralCount": neutral_count,
            },
            "timeframes": tf_data,
            "smc": {
                "pdZone": pd_zone,
                "structureTrend": structure.get("trend", "NEUTRAL"),
                "hasDemandOB": has_bull_ob,
                "hasSupplyOB": has_bear_ob,
            },
            "setup": {
                "action": action,
                "score": setup_score,
                "strategy": setup.get("strategy"),
                "entry": round(float(setup.get("entry", 0)), decimals) if setup.get("entry") else 0.0,
                "sl": round(float(setup.get("sl", 0)), decimals) if setup.get("sl") else 0.0,
                "tp": round(float(setup.get("tp", 0)), decimals) if setup.get("tp") else 0.0,
                "rr": round(float(setup.get("rr", 0)), 2) if setup.get("rr") else 0.0,
            },
        })

    # Sort results so A+ and A setups appear at the very top of the heatmap
    def sort_key(item):
        grade = item["alignment"]["grade"]
        if grade == "A+":
            return (0, -item["alignment"]["score"])
        elif grade == "A":
            return (1, -item["alignment"]["score"])
        elif grade == "B":
            return (2, -item["alignment"]["score"])
        else:
            return (3, -item["alignment"]["score"])

    results.sort(key=sort_key)

    # Market Overview Stats
    total_pairs = len(results)
    a_plus_count = sum(1 for r in results if r["alignment"]["grade"] == "A+")
    a_count = sum(1 for r in results if r["alignment"]["grade"] == "A")
    chop_count = sum(1 for r in results if r["alignment"]["grade"] == "CHOP")
    active_signals = sum(1 for r in results if r["setup"]["action"] in ("BUY", "SELL"))

    return {
        "pairs": results,
        "summary": {
            "totalPairs": total_pairs,
            "aPlusCount": a_plus_count,
            "aCount": a_count,
            "chopCount": chop_count,
            "activeSignals": active_signals,
            "marketSentiment": (
                "BULLISH DOMINANCE"
                if sum(r["alignment"]["direction"] == "BULLISH" for r in results) >= 4
                else "BEARISH DOMINANCE"
                if sum(r["alignment"]["direction"] == "BEARISH" for r in results) >= 4
                else "SELECTIVE CONFLUENCE"
            ),
        },
    }
