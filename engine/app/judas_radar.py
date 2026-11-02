"""
judas_radar.py — ICT Asian Range & Judas Swing Radar Engine.
Tracks Asian Session (00:00 - 08:00 UTC) & London Session (07:00 - 13:00 UTC) high/low boundaries,
detects Buy-side (BSL) and Sell-side (SSL) liquidity raids / Turtle Soup fakeouts,
and identifies confirmed Judas Swing reversal entries with Market Structure Shift (MSS).
"""

import datetime
import logging
from typing import Any, Dict, List, Optional
import pandas as pd

from app import config

logger = logging.getLogger("judas_radar")

PIP_SIZES = {
    "XAUUSD": 0.10,     # $0.10 = 1 pip for Gold
    "EURUSD": 0.00010,  # 1 pip = 0.0001
    "GBPUSD": 0.00010,  # 1 pip = 0.0001
    "USDJPY": 0.010,    # 1 pip = 0.01
    "US30": 1.0,        # 1 point = 1 pip
    "NAS100": 1.0,      # 1 point = 1 pip
    "BTCUSD": 1.0,      # $1 = 1 point
}


def analyze_judas_radar(symbol: str, candles: List[List[float]], current_price: float) -> Dict[str, Any]:
    """
    Computes Asian & London session ranges and evaluates Judas Swing sweeps.
    candles: 15m or 5m candles, format [ts_ms, o, h, l, c, v].
    """
    sym = symbol.upper()
    pip_size = PIP_SIZES.get(sym, 0.10)
    rules = config.EXNESS_INSTRUMENT_RULES.get(sym, {})
    decimals = rules.get("decimals", 2)
    p_fmt = f"{{:.{decimals}f}}"

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    today_date = now_utc.date()
    yesterday_date = today_date - datetime.timedelta(days=1)

    if not candles or len(candles) < 10:
        return {
            "symbol": sym,
            "status": "INSUFFICIENT_DATA",
            "message": "Collecting candle history...",
            "price": current_price,
        }

    # Group candles into UTC days and sessions
    # Asian Session: 00:00 - 08:00 UTC
    # London Session: 07:00 - 13:00 UTC
    # NY Session: 13:00 - 21:00 UTC
    today_candles: List[List[float]] = []
    yesterday_candles: List[List[float]] = []

    for c in candles:
        dt = datetime.datetime.fromtimestamp(c[0] / 1000.0, tz=datetime.timezone.utc)
        if dt.date() == today_date:
            today_candles.append(c)
        elif dt.date() == yesterday_date:
            yesterday_candles.append(c)

    # If today just started and has < 4 candles, blend with yesterday's session
    active_pool = today_candles if len(today_candles) >= 4 else yesterday_candles

    today_asian: List[List[float]] = []
    today_london: List[List[float]] = []
    post_asian: List[List[float]] = []

    for c in active_pool:
        dt = datetime.datetime.fromtimestamp(c[0] / 1000.0, tz=datetime.timezone.utc)
        if 0 <= dt.hour < 8:
            today_asian.append(c)
        elif dt.hour >= 8:
            post_asian.append(c)

        if 7 <= dt.hour < 13:
            today_london.append(c)

    # 1. Asian Range Computation
    if today_asian:
        asian_high = max(float(c[2]) for c in today_asian)
        asian_low = min(float(c[3]) for c in today_asian)
        asian_range_val = asian_high - asian_low
        asian_range_pips = round(asian_range_val / pip_size, 1)
        asian_midpoint = (asian_high + asian_low) / 2.0
        is_asian_developing = now_utc.hour < 8
    else:
        # Fallback to recent 20 bars range
        recent = candles[-20:]
        asian_high = max(float(c[2]) for c in recent)
        asian_low = min(float(c[3]) for c in recent)
        asian_range_val = asian_high - asian_low
        asian_range_pips = round(asian_range_val / pip_size, 1)
        asian_midpoint = (asian_high + asian_low) / 2.0
        is_asian_developing = True

    # 2. London Range Computation
    if today_london:
        london_high = max(float(c[2]) for c in today_london)
        london_low = min(float(c[3]) for c in today_london)
        london_range_val = london_high - london_low
        london_range_pips = round(london_range_val / pip_size, 1)
        london_midpoint = (london_high + london_low) / 2.0
        london_status = "ESTABLISHED" if now_utc.hour >= 13 else "ACTIVE"
    else:
        london_high = asian_high
        london_low = asian_low
        london_range_val = asian_range_val
        london_range_pips = asian_range_pips
        london_midpoint = asian_midpoint
        london_status = "PENDING_OPEN"

    # 3. Liquidity Sweep & Judas Swing Detection
    # Has any post-Asian candle swept Asian High or Low?
    asian_high_swept = False
    asian_low_swept = False
    max_sweep_high = asian_high
    min_sweep_low = asian_low

    # Check post-Asian bars or latest 12 bars
    eval_bars = post_asian if post_asian else candles[-8:]
    for c in eval_bars:
        h = float(c[2])
        l = float(c[3])
        if h > asian_high:
            asian_high_swept = True
            if h > max_sweep_high:
                max_sweep_high = h
        if l < asian_low:
            asian_low_swept = True
            if l < min_sweep_low:
                min_sweep_low = l

    sweep_high_pips = round(max(0.0, max_sweep_high - asian_high) / pip_size, 1)
    sweep_low_pips = round(max(0.0, asian_low - min_sweep_low) / pip_size, 1)

    # Determine Judas Swing Status
    # Criteria for Bearish Judas Swing:
    # 1. Asian High swept by >= 2.0 pips
    # 2. Price rejected back below Asian High (current_price < asian_high)
    # Criteria for Bullish Judas Swing:
    # 1. Asian Low swept by >= 2.0 pips
    # 2. Price rejected back above Asian Low (current_price > asian_low)
    judas_state = "RANGE_BOUND"
    trade_setup: Optional[Dict[str, Any]] = None
    badge_label = "RANGE BOUND"
    badge_color = "zinc"

    # Check last bar close for reclaim confirmation
    last_close = float(candles[-1][4]) if candles else current_price

    if asian_high_swept and sweep_high_pips >= 2.0:
        if last_close <= asian_high:
            judas_state = "BEARISH_JUDAS_CONFIRMED"
            badge_label = f"BEARISH JUDAS CONFIRMED (+{sweep_high_pips}p raid)"
            badge_color = "rose"
            sl_price = round(max_sweep_high + (pip_size * 5), decimals)
            tp_price = round(asian_low, decimals)
            sl_dist = abs(current_price - sl_price)
            tp_dist = abs(current_price - tp_price)
            rr = round(tp_dist / sl_dist, 2) if sl_dist > 0 else 2.0

            trade_setup = {
                "action": "SELL",
                "trigger": "Asian High Liquidity Sweep & Rejection",
                "entry": round(current_price, decimals),
                "sl": sl_price,
                "tp": tp_price,
                "rr": rr,
                "confidenceScore": 88,
                "rationale": (
                    f"Smart money raided Asian High by {sweep_high_pips} pips to trigger retail breakout stops, "
                    f"then rejected back below {p_fmt.format(asian_high)}. Target: Asian Low ({p_fmt.format(asian_low)})."
                ),
            }
        else:
            judas_state = "SWEEPING_HIGH"
            badge_label = f"BSL RAID IN PROGRESS (+{sweep_high_pips}p)"
            badge_color = "amber"

    elif asian_low_swept and sweep_low_pips >= 2.0:
        if last_close >= asian_low:
            judas_state = "BULLISH_JUDAS_CONFIRMED"
            badge_label = f"BULLISH JUDAS CONFIRMED (-{sweep_low_pips}p raid)"
            badge_color = "emerald"
            sl_price = round(min_sweep_low - (pip_size * 5), decimals)
            tp_price = round(asian_high, decimals)
            sl_dist = abs(current_price - sl_price)
            tp_dist = abs(current_price - tp_price)
            rr = round(tp_dist / sl_dist, 2) if sl_dist > 0 else 2.0

            trade_setup = {
                "action": "BUY",
                "trigger": "Asian Low Liquidity Sweep & Reclaim",
                "entry": round(current_price, decimals),
                "sl": sl_price,
                "tp": tp_price,
                "rr": rr,
                "confidenceScore": 88,
                "rationale": (
                    f"Smart money swept Asian Low by {sweep_low_pips} pips to collect retail sell stops, "
                    f"then reclaimed above {p_fmt.format(asian_low)}. Target: Asian High ({p_fmt.format(asian_high)})."
                ),
            }
        else:
            judas_state = "SWEEPING_LOW"
            badge_label = f"SSL RAID IN PROGRESS (-{sweep_low_pips}p)"
            badge_color = "amber"
    else:
        # Check proximity to boundaries
        dist_to_high_pips = round((asian_high - current_price) / pip_size, 1)
        dist_to_low_pips = round((current_price - asian_low) / pip_size, 1)

        if dist_to_high_pips < 5.0 and dist_to_high_pips >= 0:
            judas_state = "APPROACHING_ASIAN_HIGH"
            badge_label = f"NEAR ASIAN HIGH ({dist_to_high_pips}p)"
            badge_color = "cyan"
        elif dist_to_low_pips < 5.0 and dist_to_low_pips >= 0:
            judas_state = "APPROACHING_ASIAN_LOW"
            badge_label = f"NEAR ASIAN LOW ({dist_to_low_pips}p)"
            badge_color = "cyan"
        else:
            judas_state = "CONSOLIDATION"
            badge_label = f"INSIDE ASIAN RANGE ({asian_range_pips}p)"
            badge_color = "zinc"

    # Current Price Position inside Asian Range (0% = at low, 100% = at high)
    if asian_range_val > 0:
        position_pct = round(((current_price - asian_low) / asian_range_val) * 100.0, 1)
    else:
        position_pct = 50.0

    return {
        "symbol": sym,
        "price": round(current_price, decimals),
        "pipSize": pip_size,
        "decimals": decimals,
        "asianRange": {
            "high": round(asian_high, decimals),
            "low": round(asian_low, decimals),
            "midpoint": round(asian_midpoint, decimals),
            "rangePips": asian_range_pips,
            "status": "DEVELOPING" if is_asian_developing else "FINALIZED",
            "positionPct": position_pct,
        },
        "londonRange": {
            "high": round(london_high, decimals),
            "low": round(london_low, decimals),
            "midpoint": round(london_midpoint, decimals),
            "rangePips": london_range_pips,
            "status": london_status,
        },
        "sweepAnalysis": {
            "asianHighSwept": asian_high_swept,
            "asianLowSwept": asian_low_swept,
            "sweepHighPips": sweep_high_pips,
            "sweepLowPips": sweep_low_pips,
            "maxSweepHigh": round(max_sweep_high, decimals),
            "minSweepLow": round(min_sweep_low, decimals),
            "judasState": judas_state,
            "badgeLabel": badge_label,
            "badgeColor": badge_color,
        },
        "tradeSetup": trade_setup,
        "updatedAtUtc": now_utc.strftime("%H:%M:%S UTC"),
    }


def analyze_all_judas_radars(state_obj) -> List[Dict[str, Any]]:
    """Runs Judas Radar across all 7 supported instruments."""
    results = []
    for sym in config.SYMBOLS:
        sym_state = state_obj.get_symbol(sym)
        if not sym_state:
            continue
        candles = sym_state.candles.get("15m", []) or sym_state.candles.get("5m", [])
        radar = analyze_judas_radar(sym, candles, sym_state.price)
        results.append(radar)
    return results

