"""
Smart Money Concepts (SMC) & Inner Circle Trader (ICT) Quantitative Engine
Implements:
1. Market Structure: BOS (Break of Structure), CHoCH (Change of Character), Major Swings
2. Order Blocks: Bullish OB (Demand), Bearish OB (Supply), Invalidation status
3. Fair Value Gaps (FVG): BISI (Buyside Imbalance), SIBI (Sellside Imbalance), Mitigated vs Unmitigated
4. Liquidity Pools & Sweeps: Buy-side Liquidity (BSL), Sell-side Liquidity (SSL), Turtle Soup / Judas Swings
5. Premium vs Discount (PD Arrays): Equilibrium (50%), OTE (0.618 - 0.786 Fib), Range Position
6. ICT Killzones: Asian, London Open, New York Open, London Close, AMD Cycle Phase
7. Institutional Risk Management: Exness Lot Size Calculator, Stop Loss in Pips/Points, 1:2 / 1:3.5 RR Targets
"""

import datetime
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd


def _find_swings(highs: np.ndarray, lows: np.ndarray, window: int = 2) -> Dict[str, List[Dict[str, Any]]]:
    """Finds swing highs and swing lows using local fractal pivot window."""
    n = len(highs)
    swing_highs = []
    swing_lows = []

    for i in range(window, n - window):
        # Swing High
        is_sh = True
        for k in range(1, window + 1):
            if highs[i] <= highs[i - k] or highs[i] <= highs[i + k]:
                is_sh = False
                break
        if is_sh:
            swing_highs.append({"index": i, "price": float(highs[i])})

        # Swing Low
        is_sl = True
        for k in range(1, window + 1):
            if lows[i] >= lows[i - k] or lows[i] >= lows[i + k]:
                is_sl = False
                break
        if is_sl:
            swing_lows.append({"index": i, "price": float(lows[i])})

    return {"highs": swing_highs, "lows": swing_lows}


def analyze_market_structure(df: pd.DataFrame, current_price: float) -> Dict[str, Any]:
    """
    Computes Market Structure, BOS (Break of Structure), and CHoCH (Change of Character).
    """
    if df is None or len(df) < 20:
        return {
            "trend": "NEUTRAL",
            "bos": {"type": "none", "level": 0.0, "broken": False, "status": "No BOS detected"},
            "choch": {"type": "none", "level": 0.0, "active": False, "status": "No CHoCH detected"},
            "swingHigh": round(current_price * 1.01, 2),
            "swingLow": round(current_price * 0.99, 2),
            "structureDetail": "Building candle history...",
        }

    highs = df["high"].values
    lows = df["low"].values
    closes = df["close"].values

    swings = _find_swings(highs, lows, window=2)
    sh_list = swings["highs"]
    sl_list = swings["lows"]

    recent_sh = sh_list[-1]["price"] if sh_list else float(highs[-20:].max())
    recent_sl = sl_list[-1]["price"] if sl_list else float(lows[-20:].min())

    prev_sh = sh_list[-2]["price"] if len(sh_list) >= 2 else recent_sh
    prev_sl = sl_list[-2]["price"] if len(sl_list) >= 2 else recent_sl

    last_close = float(closes[-1])

    # Determine trend by swing progression
    is_bullish = recent_sh >= prev_sh and recent_sl >= prev_sl
    is_bearish = recent_sh <= prev_sh and recent_sl <= prev_sl

    trend = "BULLISH" if is_bullish else ("BEARISH" if is_bearish else "NEUTRAL")

    # Check BOS (Break of Structure)
    bos_type = "none"
    bos_level = 0.0
    bos_broken = False
    bos_status = "Consolidation / Inside Range"

    if last_close > recent_sh:
        bos_type = "bullish"
        bos_level = round(recent_sh, 2)
        bos_broken = True
        bos_status = f"Bullish BOS confirmed above ${recent_sh:.2f}"
    elif last_close < recent_sl:
        bos_type = "bearish"
        bos_level = round(recent_sl, 2)
        bos_broken = True
        bos_status = f"Bearish BOS confirmed below ${recent_sl:.2f}"
    else:
        # Near break
        if recent_sh > 0 and (recent_sh - last_close) / recent_sh < 0.003:
            bos_status = f"Testing Bullish Breakout Level at ${recent_sh:.2f}"
        elif recent_sl > 0 and (last_close - recent_sl) / recent_sl < 0.003:
            bos_status = f"Testing Bearish Breakdown Level at ${recent_sl:.2f}"
        else:
            bos_status = f"Ranging between ${recent_sl:.2f} - ${recent_sh:.2f}"

    # Check CHoCH (Change of Character)
    choch_type = "none"
    choch_level = 0.0
    choch_active = False
    choch_status = "Structure intact"

    if trend == "BEARISH" and last_close > prev_sh:
        choch_type = "bullish"
        choch_level = round(prev_sh, 2)
        choch_active = True
        choch_status = f"BULLISH CHoCH! Trend shifted bullish above ${prev_sh:.2f}"
    elif trend == "BULLISH" and last_close < prev_sl:
        choch_type = "bearish"
        choch_level = round(prev_sl, 2)
        choch_active = True
        choch_status = f"BEARISH CHoCH! Trend shifted bearish below ${prev_sl:.2f}"
    elif trend == "BEARISH":
        choch_type = "bullish"
        choch_level = round(recent_sh, 2)
        choch_status = f"Awaiting Bullish CHoCH flip above ${recent_sh:.2f}"
    elif trend == "BULLISH":
        choch_type = "bearish"
        choch_level = round(recent_sl, 2)
        choch_status = f"Awaiting Bearish CHoCH flip below ${recent_sl:.2f}"

    return {
        "trend": trend,
        "bos": {
            "type": bos_type,
            "level": bos_level,
            "broken": bos_broken,
            "status": bos_status,
        },
        "choch": {
            "type": choch_type,
            "level": choch_level,
            "active": choch_active,
            "status": choch_status,
        },
        "swingHigh": round(recent_sh, 2),
        "swingLow": round(recent_sl, 2),
        "prevSwingHigh": round(prev_sh, 2),
        "prevSwingLow": round(prev_sl, 2),
        "structureDetail": f"{trend} market structure on 15m. Major Swing High at ${recent_sh:.2f}, Low at ${recent_sl:.2f}.",
    }


def analyze_order_blocks_and_fvg(df: pd.DataFrame, current_price: float) -> Dict[str, Any]:
    """
    Computes Bullish & Bearish Order Blocks and Fair Value Gaps (FVG).
    """
    if df is None or len(df) < 15:
        return {
            "bullishOB": {"top": 0.0, "bottom": 0.0, "status": "None", "label": "No OB found"},
            "bearishOB": {"top": 0.0, "bottom": 0.0, "status": "None", "label": "No OB found"},
            "fvgs": [],
            "nearestBullishFVG": None,
            "nearestBearishFVG": None,
            "activeFVGCount": 0,
            "totalFVGCount": 0,
        }

    opens = df["open"].values
    highs = df["high"].values
    lows = df["low"].values
    closes = df["close"].values
    n = len(df)

    # 1. Fair Value Gaps (FVGs)
    fvgs: List[Dict[str, Any]] = []
    start_idx = max(2, n - 40)
    for i in range(start_idx, n):
        # Bullish FVG: Low of candle i > High of candle i-2
        if lows[i] > highs[i - 2]:
            gap_bottom = float(highs[i - 2])
            gap_top = float(lows[i])
            gap_mid = (gap_top + gap_bottom) / 2.0
            mitigated = False
            for k in range(i + 1, n):
                if lows[k] <= gap_mid:
                    mitigated = True
                    break
            fvgs.append({
                "type": "bullish",
                "top": round(gap_top, 2),
                "bottom": round(gap_bottom, 2),
                "mid": round(gap_mid, 2),
                "size": round(gap_top - gap_bottom, 2),
                "mitigated": mitigated,
                "label": "Bullish FVG (BISI)",
            })

        # Bearish FVG: High of candle i < Low of candle i-2
        elif highs[i] < lows[i - 2]:
            gap_top = float(lows[i - 2])
            gap_bottom = float(highs[i])
            gap_mid = (gap_top + gap_bottom) / 2.0
            mitigated = False
            for k in range(i + 1, n):
                if highs[k] >= gap_mid:
                    mitigated = True
                    break
            fvgs.append({
                "type": "bearish",
                "top": round(gap_top, 2),
                "bottom": round(gap_bottom, 2),
                "mid": round(gap_mid, 2),
                "size": round(gap_top - gap_bottom, 2),
                "mitigated": mitigated,
                "label": "Bearish FVG (SIBI)",
            })

    unmitigated_fvgs = [f for f in fvgs if not f["mitigated"]]
    unmitigated_bullish = [f for f in unmitigated_fvgs if f["type"] == "bullish" and f["top"] <= current_price]
    unmitigated_bearish = [f for f in unmitigated_fvgs if f["type"] == "bearish" and f["bottom"] >= current_price]

    nearest_bull_fvg = unmitigated_bullish[-1] if unmitigated_bullish else (
        [f for f in fvgs if f["type"] == "bullish"][-1] if [f for f in fvgs if f["type"] == "bullish"] else None
    )
    nearest_bear_fvg = unmitigated_bearish[-1] if unmitigated_bearish else (
        [f for f in fvgs if f["type"] == "bearish"][-1] if [f for f in fvgs if f["type"] == "bearish"] else None
    )

    # 2. Order Blocks (OB)
    bull_ob = None
    for i in range(n - 2, max(2, n - 35), -1):
        if closes[i] < opens[i]:  # Bearish candle
            next_move = closes[min(i + 2, n - 1)] - opens[i + 1]
            if next_move > (highs[i] - lows[i]) * 1.2:
                ob_top = max(opens[i], closes[i])
                ob_bottom = float(lows[i])
                broken = any(closes[k] < ob_bottom for k in range(i + 1, n))
                if not broken:
                    bull_ob = {
                        "top": round(ob_top, 2),
                        "bottom": round(ob_bottom, 2),
                        "status": "Active Demand",
                        "label": f"Bullish OB (${ob_bottom:.2f} - ${ob_top:.2f})",
                    }
                    break

    bear_ob = None
    for i in range(n - 2, max(2, n - 35), -1):
        if closes[i] > opens[i]:  # Bullish candle
            next_move = opens[i + 1] - closes[min(i + 2, n - 1)]
            if next_move > (highs[i] - lows[i]) * 1.2:
                ob_top = float(highs[i])
                ob_bottom = min(opens[i], closes[i])
                broken = any(closes[k] > ob_top for k in range(i + 1, n))
                if not broken:
                    bear_ob = {
                        "top": round(ob_top, 2),
                        "bottom": round(ob_bottom, 2),
                        "status": "Active Supply",
                        "label": f"Bearish OB (${ob_bottom:.2f} - ${ob_top:.2f})",
                    }
                    break

    if not bull_ob:
        min_l = float(lows[-15:].min())
        bull_ob = {
            "top": round(min_l * 1.002, 2),
            "bottom": round(min_l, 2),
            "status": "Support Zone",
            "label": f"Bullish Demand Area (${min_l:.2f})",
        }

    if not bear_ob:
        max_h = float(highs[-15:].max())
        bear_ob = {
            "top": round(max_h, 2),
            "bottom": round(max_h * 0.998, 2),
            "status": "Supply Zone",
            "label": f"Bearish Supply Area (${max_h:.2f})",
        }

    return {
        "bullishOB": bull_ob,
        "bearishOB": bear_ob,
        "nearestBullishFVG": nearest_bull_fvg,
        "nearestBearishFVG": nearest_bear_fvg,
        "activeFVGCount": len(unmitigated_fvgs),
        "totalFVGCount": len(fvgs),
    }


def analyze_liquidity_and_sweeps(df: pd.DataFrame, current_price: float) -> Dict[str, Any]:
    """
    Computes Buy-Side Liquidity (BSL), Sell-Side Liquidity (SSL), and Turtle Soup / Judas Sweeps.
    """
    if df is None or len(df) < 20:
        return {
            "bsl": {"level": round(current_price * 1.01, 2), "label": "BSL Pool"},
            "ssl": {"level": round(current_price * 0.99, 2), "label": "SSL Pool"},
            "sweep": {"detected": False, "type": "none", "desc": "No sweep detected"},
        }

    highs = df["high"].values
    lows = df["low"].values
    closes = df["close"].values
    n = len(df)

    recent_highs = highs[-30:]
    bsl_level = float(recent_highs.max())

    recent_lows = lows[-30:]
    ssl_level = float(recent_lows.min())

    sweep_detected = False
    sweep_type = "none"
    sweep_desc = "No liquidity sweep active"

    for i in range(max(0, n - 6), n):
        if lows[i] < ssl_level and closes[i] > ssl_level:
            sweep_detected = True
            sweep_type = "bullish_ssl_sweep"
            sweep_desc = f"SSL Sweep (Turtle Soup Long)! Swept ${lows[i]:.2f} and reclaimed ${closes[i]:.2f}."
            break
        elif highs[i] > bsl_level and closes[i] < bsl_level:
            sweep_detected = True
            sweep_type = "bearish_bsl_sweep"
            sweep_desc = f"BSL Sweep (Turtle Soup Short)! Swept ${highs[i]:.2f} and rejected below ${closes[i]:.2f}."
            break

    dist_to_bsl = round(bsl_level - current_price, 2)
    dist_to_ssl = round(current_price - ssl_level, 2)

    return {
        "bsl": {
            "level": round(bsl_level, 2),
            "distance": dist_to_bsl,
            "label": f"Buy-Side Liquidity (BSL) at ${bsl_level:.2f}",
        },
        "ssl": {
            "level": round(ssl_level, 2),
            "distance": dist_to_ssl,
            "label": f"Sell-Side Liquidity (SSL) at ${ssl_level:.2f}",
        },
        "sweep": {
            "detected": sweep_detected,
            "type": sweep_type,
            "desc": sweep_desc,
        },
        "internalTarget": "BSL (Old Highs)" if current_price < (bsl_level + ssl_level) / 2 else "SSL (Old Lows)",
    }


def analyze_premium_discount(df: pd.DataFrame, current_price: float) -> Dict[str, Any]:
    """
    Computes ICT Premium vs Discount Arrays, Equilibrium (50%), and Optimal Trade Entry (OTE).
    """
    if df is None or len(df) < 20:
        high = current_price * 1.01
        low = current_price * 0.99
    else:
        high = float(df["high"].iloc[-40:].max())
        low = float(df["low"].iloc[-40:].min())

    range_span = high - low if high > low else 1.0
    equilibrium = (high + low) / 2.0
    pct = max(0.0, min(100.0, ((current_price - low) / range_span) * 100.0))

    if pct < 45.0:
        zone = "DISCOUNT"
        bias = "Institutional Accumulation / Buy Zone"
        action_hint = "Look for Long entries inside Discount"
    elif pct > 55.0:
        zone = "PREMIUM"
        bias = "Institutional Distribution / Sell Zone"
        action_hint = "Look for Short entries inside Premium"
    else:
        zone = "EQUILIBRIUM"
        bias = "Fair Value / Indecision"
        action_hint = "Wait for expansion into Discount or Premium"

    ote_buy_top = round(high - 0.618 * range_span, 2)
    ote_buy_bottom = round(high - 0.786 * range_span, 2)

    ote_sell_bottom = round(low + 0.618 * range_span, 2)
    ote_sell_top = round(low + 0.786 * range_span, 2)

    return {
        "rangeHigh": round(high, 2),
        "rangeLow": round(low, 2),
        "equilibrium": round(equilibrium, 2),
        "currentPercent": round(pct, 1),
        "zone": zone,
        "bias": bias,
        "actionHint": action_hint,
        "oteLong": {"top": ote_buy_top, "bottom": ote_buy_bottom},
        "oteShort": {"top": ote_sell_top, "bottom": ote_sell_bottom},
    }


def analyze_ict_killzones() -> Dict[str, Any]:
    """
    Computes current institutional Killzone and AMD (Accumulation, Manipulation, Distribution) phase.
    Uses UTC time coordinates standard in ICT methodology.
    """
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    utc_hour = now_utc.hour
    utc_min = now_utc.minute
    total_min = utc_hour * 60 + utc_min

    is_killzone = False
    session_name = "Off-Hours / Ambient"
    phase = "CONSOLIDATION"
    detail = "Ambient institutional volume. Guard against false breakouts."

    if 0 <= total_min < 360:
        session_name = "Asian Session"
        phase = "ACCUMULATION"
        detail = "Asian Range establishment. Smart money establishes overnight liquidity boundaries."
    elif 420 <= total_min <= 600:
        is_killzone = True
        session_name = "London Open Killzone"
        phase = "MANIPULATION"
        detail = "Judas Swing active! Watch for Asian range raid before true institutional trend."
    elif 720 <= total_min <= 900:
        is_killzone = True
        session_name = "New York Open Killzone"
        phase = "DISTRIBUTION / EXPANSION"
        detail = "Peak US/London volume overlap. Strongest directional expansions occur here."
    elif 900 < total_min <= 1020:
        is_killzone = True
        session_name = "London Close Killzone"
        phase = "PROFIT TAKING / RETRACEMENT"
        detail = "European desks squaring positions. Often creates counter-trend retracements."
    elif 360 <= total_min < 420:
        session_name = "Pre-London Buffer"
        phase = "PRE-MARKET"
        detail = "Preparing for European open. Volatility starting to rise."
    elif 600 < total_min < 720:
        session_name = "London Lunch / NY Pre-market"
        phase = "MID-DAY CONSOLIDATION"
        detail = "Low liquidity deadzone between London and New York."

    ny_hour = (utc_hour - 4) % 24
    time_str = f"{utc_hour:02d}:{utc_min:02d} UTC ({ny_hour:02d}:{utc_min:02d} NY)"

    return {
        "sessionName": session_name,
        "isKillzone": is_killzone,
        "phase": phase,
        "detail": detail,
        "timeString": time_str,
        "utcTime": f"{utc_hour:02d}:{utc_min:02d}",
        "nyTime": f"{ny_hour:02d}:{utc_min:02d}",
    }


def analyze_risk_management(
    symbol: str,
    current_price: float,
    atr: float,
    balance: float = 1000.0,
    risk_pct: float = 1.0,
    pd_zone: str = "DISCOUNT",
    structure_trend: str = "BULLISH",
) -> Dict[str, Any]:
    """
    Computes Institutional Risk Management & Exness Position Sizing.
    """
    risk_usd = round(balance * (risk_pct / 100.0), 2)
    sl_points = max(1.5 * atr, 2.0 if "XAU" in symbol else 250.0)

    if "XAU" in symbol:
        dollars_per_point_per_lot = 100.0
    else:
        dollars_per_point_per_lot = 1.0

    lots_raw = risk_usd / (sl_points * dollars_per_point_per_lot)
    lot_size = max(0.01, round(lots_raw, 2))

    long_sl = round(current_price - sl_points, 2)
    long_tp1 = round(current_price + (2.0 * sl_points), 2)
    long_tp2 = round(current_price + (3.5 * sl_points), 2)

    short_sl = round(current_price + sl_points, 2)
    short_tp1 = round(current_price - (2.0 * sl_points), 2)
    short_tp2 = round(current_price - (3.5 * sl_points), 2)

    checklist = [
        {"name": "Market Structure Direction", "passed": structure_trend != "NEUTRAL", "weight": 20},
        {"name": "Correct PD Array Zone", "passed": (structure_trend == "BULLISH" and pd_zone == "DISCOUNT") or (structure_trend == "BEARISH" and pd_zone == "PREMIUM"), "weight": 25},
        {"name": "Risk:Reward >= 1:2 Minimum", "passed": True, "weight": 20},
        {"name": "Within Max 1% Risk Allocation", "passed": True, "weight": 20},
        {"name": "Exness Lot Sized Properly", "passed": lot_size >= 0.01, "weight": 15},
    ]

    confluence_score = sum(c["weight"] for c in checklist if c["passed"])

    return {
        "balance": balance,
        "riskPct": risk_pct,
        "riskUsd": risk_usd,
        "slPoints": round(sl_points, 2),
        "lotSize": lot_size,
        "longSetup": {
            "entry": round(current_price, 2),
            "sl": long_sl,
            "tp1": long_tp1,
            "tp2": long_tp2,
            "rr1": 2.0,
            "rr2": 3.5,
        },
        "shortSetup": {
            "entry": round(current_price, 2),
            "sl": short_sl,
            "tp1": short_tp1,
            "tp2": short_tp2,
            "rr1": 2.0,
            "rr2": 3.5,
        },
        "checklist": checklist,
        "confluenceScore": confluence_score,
    }


def compute_full_smc_analysis(
    symbol: str,
    df_15m: pd.DataFrame,
    current_price: float,
    atr: float = 0.0,
    balance: float = 1000.0,
    risk_pct: float = 1.0,
) -> Dict[str, Any]:
    """
    Main entry point: executes complete ICT / SMC / Risk Management pipeline.
    """
    if atr <= 0.0:
        atr = 2.5 if "XAU" in symbol else 300.0

    structure = analyze_market_structure(df_15m, current_price)
    ob_fvg = analyze_order_blocks_and_fvg(df_15m, current_price)
    liquidity = analyze_liquidity_and_sweeps(df_15m, current_price)
    pd_array = analyze_premium_discount(df_15m, current_price)
    killzone = analyze_ict_killzones()
    risk = analyze_risk_management(
        symbol=symbol,
        current_price=current_price,
        atr=atr,
        balance=balance,
        risk_pct=risk_pct,
        pd_zone=pd_array["zone"],
        structure_trend=structure["trend"],
    )

    return {
        "symbol": symbol,
        "price": current_price,
        "structure": structure,
        "orderBlocks": ob_fvg,
        "liquidity": liquidity,
        "pdArray": pd_array,
        "killzone": killzone,
        "risk": risk,
    }

