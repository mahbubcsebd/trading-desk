"""
Macro Economic & Multi-Timeframe Analytics Engine
1. High-Impact Economic News Radar (Forex Factory API)
2. US Dollar Index (DXY) Inverse Correlation Engine
3. Multi-Timeframe Confluence Matrix (15m, 1h, 4h)
"""

import datetime
import logging
import time
from typing import Any, Dict, List, Optional
import httpx
import pandas as pd
import yfinance as yf

logger = logging.getLogger("macro")

# In-memory caches with timestamp
_CALENDAR_CACHE: List[Dict[str, Any]] = []
_CALENDAR_FETCH_TS: float = 0.0

_DXY_CACHE: Dict[str, Any] = {
    "price": 102.0,
    "change24h": 0.0,
    "bias": "neutral",
    "goldImpact": "Neutral macro backdrop",
}
_DXY_FETCH_TS: float = 0.0


def fetch_economic_calendar() -> List[Dict[str, Any]]:
    """
    Fetches high-speed economic calendar from Forex Factory / Fair Economy.
    Cached for 1 hour to prevent unnecessary network requests.
    """
    global _CALENDAR_CACHE, _CALENDAR_FETCH_TS
    now = time.time()
    if _CALENDAR_CACHE and (now - _CALENDAR_FETCH_TS) < 3600.0:
        return _CALENDAR_CACHE

    url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
    try:
        with httpx.Client(timeout=6.0) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                _CALENDAR_CACHE = resp.json()
                _CALENDAR_FETCH_TS = now
                logger.info("Forex Factory calendar refreshed successfully (%d events)", len(_CALENDAR_CACHE))
                return _CALENDAR_CACHE
    except Exception as e:
        logger.warning("Failed to fetch economic calendar from Forex Factory: %s", e)

    return _CALENDAR_CACHE


def analyze_news_radar() -> Dict[str, Any]:
    """
    Analyzes today's USD High-Impact (Red Folder) and Medium-Impact events.
    Detects if current time is within +/- 30 minutes of a high-impact release.
    """
    events = fetch_economic_calendar()
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    usd_events = []
    next_event = None
    min_future_seconds = float("inf")
    is_news_window = False
    active_warning = None

    for ev in events:
        if ev.get("country") != "USD":
            continue
        impact = ev.get("impact", "")
        if impact not in ("High", "Medium"):
            continue

        date_str = ev.get("date", "")
        if not date_str:
            continue

        try:
            ev_dt = datetime.datetime.fromisoformat(date_str)
            if ev_dt.tzinfo is None:
                ev_dt = ev_dt.replace(tzinfo=datetime.timezone.utc)
            else:
                ev_dt = ev_dt.astimezone(datetime.timezone.utc)
        except Exception:
            continue

        # Check if event is today (+/- 24 hours of now)
        diff_seconds = (ev_dt - now_utc).total_seconds()
        diff_minutes = int(diff_seconds / 60)

        # Check news window: within 30 min before or 15 min after a High impact event
        if impact == "High" and -15 <= diff_minutes <= 30:
            is_news_window = True
            if diff_minutes >= 0:
                active_warning = f"HIGH-IMPACT NEWS RISK: {ev.get('title')} in {diff_minutes}m! Watch for spread spikes."
            else:
                active_warning = f"HIGH VOLATILITY: {ev.get('title')} just released {abs(diff_minutes)}m ago!"

        # Track next upcoming event
        if 0 <= diff_seconds < min_future_seconds:
            min_future_seconds = diff_seconds
            next_event = {
                "title": ev.get("title"),
                "country": ev.get("country"),
                "impact": ev.get("impact"),
                "timeString": ev_dt.strftime("%H:%M UTC"),
                "minutesUntil": diff_minutes,
                "forecast": ev.get("forecast") or "--",
                "previous": ev.get("previous") or "--",
            }

        # Keep relevant events within +/- 18 hours
        if abs(diff_seconds) <= 18 * 3600:
            usd_events.append({
                "title": ev.get("title"),
                "impact": impact,
                "timeString": ev_dt.strftime("%H:%M UTC"),
                "minutesUntil": diff_minutes,
                "forecast": ev.get("forecast") or "--",
                "previous": ev.get("previous") or "--",
                "isPast": diff_seconds < 0,
            })

    # Sort events chronologically
    usd_events.sort(key=lambda x: x["minutesUntil"])

    return {
        "isNewsWindow": is_news_window,
        "warning": active_warning,
        "nextEvent": next_event,
        "upcomingCount": len([e for e in usd_events if not e["isPast"]]),
        "events": usd_events[:5],  # top 5 closest events
    }


def analyze_dxy_correlation() -> Dict[str, Any]:
    """
    Fetches DXY (US Dollar Index) price and computes macro tailwind/headwind for Gold.
    Cached for 2 minutes.
    """
    global _DXY_CACHE, _DXY_FETCH_TS
    now = time.time()
    if (now - _DXY_FETCH_TS) < 120.0 and _DXY_CACHE.get("price", 0) > 0:
        return _DXY_CACHE

    try:
        ticker = yf.Ticker("DX-Y.NYB")
        hist = ticker.history(period="2d", interval="15m")
        if hist is not None and len(hist) >= 5:
            if isinstance(hist.columns, pd.MultiIndex):
                hist.columns = hist.columns.get_level_values(0)
            close = hist["Close"].dropna()
            cur_price = float(close.iloc[-1])
            prev_price = float(close.iloc[0])
            change_pct = round(((cur_price - prev_price) / prev_price) * 100.0, 2)

            # Trend over last 10 bars
            sma = close.iloc[-10:].mean()
            if cur_price > sma * 1.0005:
                bias = "bull"
                gold_impact = "Macro Headwind for Gold (Dollar Rising)"
            elif cur_price < sma * 0.9995:
                bias = "bear"
                gold_impact = "Macro Tailwind for Gold (Dollar Falling)"
            else:
                bias = "neutral"
                gold_impact = "DXY Neutral / Range-bound"

            _DXY_CACHE = {
                "price": round(cur_price, 2),
                "change24h": change_pct,
                "bias": bias,
                "goldImpact": gold_impact,
            }
            _DXY_FETCH_TS = now
            return _DXY_CACHE
    except Exception as e:
        logger.debug("DXY history fetch failed: %s", e)

    return _DXY_CACHE


def analyze_multi_timeframe(
    df_15m: pd.DataFrame,
    df_1h: pd.DataFrame,
    df_4h: pd.DataFrame,
) -> Dict[str, Any]:
    """
    Computes Multi-Timeframe Alignment Matrix across 15m, 1h, and 4h.
    """
    def _eval_tf(df: pd.DataFrame, name: str) -> Dict[str, Any]:
        if df is None or len(df) < 20:
            return {"tf": name, "trend": "NEUTRAL", "status": "Insufficient data"}
        closes = df["close"]
        cur = float(closes.iloc[-1])
        ma20 = float(closes.iloc[-20:].mean())
        ma50 = float(closes.iloc[-50:].mean()) if len(df) >= 50 else ma20

        if cur > ma20 and ma20 >= ma50:
            trend = "BULLISH"
            status = "Strong Uptrend above MAs"
        elif cur < ma20 and ma20 <= ma50:
            trend = "BEARISH"
            status = "Strong Downtrend below MAs"
        elif cur > ma20:
            trend = "MILD BULL"
            status = "Above Short-Term MA"
        else:
            trend = "MILD BEAR"
            status = "Below Short-Term MA"

        return {"tf": name, "trend": trend, "status": status}

    tf_15m = _eval_tf(df_15m, "15m")
    tf_1h = _eval_tf(df_1h, "1h")
    tf_4h = _eval_tf(df_4h, "4h")

    bull_count = sum(1 for t in (tf_15m, tf_1h, tf_4h) if "BULL" in t["trend"])
    bear_count = sum(1 for t in (tf_15m, tf_1h, tf_4h) if "BEAR" in t["trend"])

    if bull_count >= 3:
        alignment = "TRIPLE SCREEN BULLISH"
        align_score = 100
    elif bear_count >= 3:
        alignment = "TRIPLE SCREEN BEARISH"
        align_score = 100
    elif bull_count == 2:
        alignment = "MODERATE BULLISH (2/3)"
        align_score = 66
    elif bear_count == 2:
        alignment = "MODERATE BEARISH (2/3)"
        align_score = 66
    else:
        alignment = "MIXED / CONFLICTING TIMEFRAMES"
        align_score = 33

    return {
        "alignment": alignment,
        "score": align_score,
        "tf15m": tf_15m,
        "tf1h": tf_1h,
        "tf4h": tf_4h,
    }


def compute_macro_context(
    df_15m: pd.DataFrame,
    df_1h: pd.DataFrame,
    df_4h: pd.DataFrame,
) -> Dict[str, Any]:
    """
    Main entry point for macro context: News Radar, DXY, and MTF Matrix.
    """
    news = analyze_news_radar()
    dxy = analyze_dxy_correlation()
    mtf = analyze_multi_timeframe(df_15m, df_1h, df_4h)

    return {
        "news": news,
        "dxy": dxy,
        "mtf": mtf,
    }

