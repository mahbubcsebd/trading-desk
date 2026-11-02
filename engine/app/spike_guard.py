"""
spike_guard.py — Red Folder News Spike Guard & Dynamic Spread Monitor.
1. Real-time dynamic spread monitor (TradingView live bid/ask vs Exness baseline).
2. Economic calendar aggregator (biquote.io MQL5 + Forex Factory + local persistent cache).
3. Institutional No-Trade Blackout Window & Pre-News Guard (-15m to +15m lockout).
"""

import datetime
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional
import httpx

from app import config

logger = logging.getLogger("spike_guard")

# Persistent cache file for economic calendar
CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CACHE_FILE = os.path.join(CACHE_DIR, "economic_calendar.json")

# In-memory caches
_CALENDAR_CACHE: List[Dict[str, Any]] = []
_CALENDAR_FETCH_TS: float = 0.0

_SPREAD_CACHE: Dict[str, Dict[str, Any]] = {}
_SPREAD_FETCH_TS: Dict[str, float] = {}

# Baseline typical spreads for Exness Standard / Pro accounts
TYPICAL_SPREADS: Dict[str, Dict[str, Any]] = {
    "XAUUSD": {"spread": 0.18, "unit": "18¢ / $0.18", "pip_factor": 1.0, "cost_multiplier": 100.0, "decimals": 2},
    "EURUSD": {"spread": 0.00007, "unit": "0.7 pips", "pip_factor": 10000.0, "cost_multiplier": 100000.0, "decimals": 5},
    "GBPUSD": {"spread": 0.00010, "unit": "1.0 pips", "pip_factor": 10000.0, "cost_multiplier": 100000.0, "decimals": 5},
    "USDJPY": {"spread": 0.008, "unit": "0.8 pips", "pip_factor": 100.0, "cost_multiplier": 1000.0, "decimals": 3},
    "BTCUSD": {"spread": 18.0, "unit": "$18.00", "pip_factor": 1.0, "cost_multiplier": 1.0, "decimals": 2},
    "US30": {"spread": 2.2, "unit": "2.2 pts", "pip_factor": 1.0, "cost_multiplier": 1.0, "decimals": 2},
    "NAS100": {"spread": 1.4, "unit": "1.4 pts", "pip_factor": 1.0, "cost_multiplier": 1.0, "decimals": 2},
}

SYMBOL_CURRENCIES: Dict[str, List[str]] = {
    "XAUUSD": ["USD"],
    "BTCUSD": ["USD"],
    "EURUSD": ["EUR", "USD"],
    "GBPUSD": ["GBP", "USD"],
    "USDJPY": ["JPY", "USD"],
    "US30": ["USD"],
    "NAS100": ["USD"],
}

SCANNER_TICKERS: Dict[str, tuple[str, str]] = {
    "XAUUSD": ("cfd", "OANDA:XAUUSD"),
    "BTCUSD": ("crypto", "COINBASE:BTCUSD"),
    "EURUSD": ("forex", "FX:EURUSD"),
    "GBPUSD": ("forex", "FX:GBPUSD"),
    "USDJPY": ("forex", "FX:USDJPY"),
    "US30": ("cfd", "OANDA:US30USD"),
    "NAS100": ("cfd", "OANDA:NAS100USD"),
}


def _save_calendar_to_disk(events: List[Dict[str, Any]]) -> None:
    """Saves calendar events to local disk cache."""
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({"updated_at": time.time(), "events": events}, f, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"Failed to persist economic calendar to disk: {e}")


def _load_calendar_from_disk() -> List[Dict[str, Any]]:
    """Loads calendar events from local disk cache if available."""
    try:
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("events", [])
    except Exception as e:
        logger.warning(f"Failed to load cached economic calendar from disk: {e}")
    return []


def fetch_unified_calendar() -> List[Dict[str, Any]]:
    """
    Fetches economic calendar from multi-tier sources:
    1. biquote.io (MQL5 calendar feed)
    2. faireconomy.media (Forex Factory)
    3. Persistent local disk cache
    """
    global _CALENDAR_CACHE, _CALENDAR_FETCH_TS
    now = time.time()
    if _CALENDAR_CACHE and (now - _CALENDAR_FETCH_TS) < 1800.0:  # 30 min cache
        return _CALENDAR_CACHE

    # Attempt 1: biquote.io MQL5 API
    try:
        with httpx.Client(timeout=4.0) as client:
            resp = client.get("https://biquote.io/api/calendar")
            if resp.status_code == 200:
                raw_events = resp.json()
                parsed = []
                for ev in raw_events:
                    curr = (ev.get("currency") or "").upper()
                    if not curr:
                        continue
                    imp_raw = (ev.get("importance") or "").lower()
                    impact = "High" if imp_raw == "high" else ("Medium" if imp_raw == "medium" else "Low")
                    t_str = ev.get("time") or ""
                    if not t_str:
                        continue
                    
                    parsed.append({
                        "id": str(ev.get("id") or ""),
                        "title": ev.get("name") or "Economic Event",
                        "country": ev.get("countryCode") or curr,
                        "currency": curr,
                        "impact": impact,
                        "time": t_str,
                        "forecast": str(ev.get("forecast") or "--") if ev.get("forecast") is not None else "--",
                        "previous": str(ev.get("previous") or "--") if ev.get("previous") is not None else "--",
                        "source": "MQL5",
                    })

                if parsed:
                    _CALENDAR_CACHE = parsed
                    _CALENDAR_FETCH_TS = now
                    _save_calendar_to_disk(parsed)
                    logger.info(f"Loaded {len(parsed)} events from biquote.io")
                    return _CALENDAR_CACHE
    except Exception as e:
        logger.debug(f"biquote.io fetch failed: {e}")

    # Attempt 2: Forex Factory JSON
    try:
        headers = {"User-Agent": "Mozilla/5.0"}
        with httpx.Client(timeout=4.0, headers=headers) as client:
            resp = client.get("https://nfs.faireconomy.media/ff_calendar_thisweek.json")
            if resp.status_code == 200:
                raw_events = resp.json()
                parsed = []
                for ev in raw_events:
                    curr = (ev.get("country") or "").upper()
                    imp_raw = ev.get("impact") or "Low"
                    t_str = ev.get("date") or ""
                    parsed.append({
                        "id": f"ff_{ev.get('title')}_{t_str}",
                        "title": ev.get("title") or "Economic Event",
                        "country": curr,
                        "currency": curr,
                        "impact": imp_raw,
                        "time": t_str,
                        "forecast": ev.get("forecast") or "--",
                        "previous": ev.get("previous") or "--",
                        "source": "ForexFactory",
                    })
                if parsed:
                    _CALENDAR_CACHE = parsed
                    _CALENDAR_FETCH_TS = now
                    _save_calendar_to_disk(parsed)
                    logger.info(f"Loaded {len(parsed)} events from Forex Factory")
                    return _CALENDAR_CACHE
    except Exception as e:
        logger.debug(f"Forex Factory fetch failed: {e}")

    # Attempt 3: Disk Cache Fallback
    disk_events = _load_calendar_from_disk()
    if disk_events:
        _CALENDAR_CACHE = disk_events
        _CALENDAR_FETCH_TS = now
        logger.info(f"Loaded {len(disk_events)} events from disk cache")
        return _CALENDAR_CACHE

    return _CALENDAR_CACHE


_ALL_SPREADS_CACHE: Dict[str, Dict[str, Any]] = {}
_ALL_SPREADS_FETCH_TS: float = 0.0

def fetch_all_spreads() -> Dict[str, Dict[str, Any]]:
    """
    Batches TradingView requests by endpoint (cfd, forex, crypto)
    with a 5-second in-memory cache for ultra-low latency response (<0.05s on cache hit).
    """
    global _ALL_SPREADS_CACHE, _ALL_SPREADS_FETCH_TS
    now = time.time()
    if _ALL_SPREADS_CACHE and (now - _ALL_SPREADS_FETCH_TS) < 5.0:
        return _ALL_SPREADS_CACHE

    batches = {
        "cfd": [("XAUUSD", "OANDA:XAUUSD"), ("US30", "OANDA:US30USD"), ("NAS100", "OANDA:NAS100USD")],
        "forex": [("EURUSD", "FX:EURUSD"), ("GBPUSD", "FX:GBPUSD"), ("USDJPY", "FX:USDJPY")],
        "crypto": [("BTCUSD", "COINBASE:BTCUSD")],
    }

    results: Dict[str, Dict[str, Any]] = {}

    for endpoint, pair_list in batches.items():
        tickers = [p[1] for p in pair_list]
        sym_map = {p[1]: p[0] for p in pair_list}
        try:
            with httpx.Client(timeout=2.0) as client:
                r = client.post(
                    f"https://scanner.tradingview.com/{endpoint}/scan",
                    json={"symbols": {"tickers": tickers}, "columns": ["bid", "ask", "close"]},
                )
                if r.status_code == 200:
                    data = r.json().get("data", [])
                    for item in data:
                        t = item.get("s")
                        sym = sym_map.get(t)
                        if not sym:
                            continue
                        vals = item.get("d", [])
                        typ_info = TYPICAL_SPREADS.get(sym, {"spread": 0.20, "unit": "pts", "cost_multiplier": 1.0, "decimals": 2})
                        typical = typ_info["spread"]
                        decimals = typ_info["decimals"]

                        bid = None
                        ask = None
                        live_spread = None

                        if len(vals) >= 2 and vals[0] is not None and vals[1] is not None:
                            bid = float(vals[0])
                            ask = float(vals[1])
                            live_spread = round(max(0.0, ask - bid), decimals)
                        elif len(vals) >= 3 and vals[2] is not None:
                            mid = float(vals[2])
                            bid = round(mid - typical / 2, decimals)
                            ask = round(mid + typical / 2, decimals)
                            live_spread = typical

                        if live_spread is None:
                            live_spread = typical
                            bid = 1.0
                            ask = 1.0 + typical

                        multiplier = round(live_spread / typical, 2) if typical > 0 else 1.0
                        if multiplier <= 1.25:
                            status = "OPTIMAL"
                            status_color = "emerald"
                        elif multiplier <= 2.2:
                            status = "ELEVATED"
                            status_color = "amber"
                        else:
                            status = "BLOWN"
                            status_color = "rose"

                        cost_per_lot = round(live_spread * typ_info["cost_multiplier"], 2)

                        results[sym] = {
                            "symbol": sym,
                            "bid": bid,
                            "ask": ask,
                            "liveSpread": live_spread,
                            "typicalSpread": typical,
                            "unit": typ_info["unit"],
                            "multiplier": multiplier,
                            "status": status,
                            "statusColor": status_color,
                            "costPerLotUsd": cost_per_lot,
                            "timestamp": now,
                        }
        except Exception as e:
            logger.debug(f"Batch fetch error for {endpoint}: {e}")

    # Fill in fallbacks for any missing symbol
    for sym in config.SYMBOLS:
        if sym not in results:
            typ_info = TYPICAL_SPREADS.get(sym, {"spread": 0.20, "unit": "pts", "cost_multiplier": 1.0, "decimals": 2})
            results[sym] = {
                "symbol": sym,
                "bid": 100.0,
                "ask": 100.0 + typ_info["spread"],
                "liveSpread": typ_info["spread"],
                "typicalSpread": typ_info["spread"],
                "unit": typ_info["unit"],
                "multiplier": 1.0,
                "status": "OPTIMAL",
                "statusColor": "emerald",
                "costPerLotUsd": round(typ_info["spread"] * typ_info["cost_multiplier"], 2),
                "timestamp": now,
            }

    _ALL_SPREADS_CACHE = results
    _ALL_SPREADS_FETCH_TS = now
    return results


def fetch_live_spread(symbol: str) -> Dict[str, Any]:
    """Fetches spread for a single symbol using cached batch results."""
    all_spreads = fetch_all_spreads()
    return all_spreads.get(symbol.upper(), fetch_all_spreads()["XAUUSD"])



def compute_spike_guard(symbol: str, app_state=None) -> Dict[str, Any]:
    """
    Computes comprehensive Red Folder News Spike Guard & Dynamic Spread Monitor
    for a given symbol.
    """
    sym = symbol.upper()
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    target_currencies = SYMBOL_CURRENCIES.get(sym, ["USD"])

    events = fetch_unified_calendar()
    spread_data = fetch_live_spread(sym)

    relevant_events = []
    next_high_event = None
    min_future_sec = float("inf")
    
    # Active window checks
    active_high_event = None
    approaching_high_event = None
    cooling_high_event = None

    for ev in events:
        c = ev.get("currency", "").upper()
        if c not in target_currencies:
            continue

        impact = ev.get("impact", "")
        if impact not in ("High", "Medium"):
            continue

        t_str = ev.get("time", "")
        try:
            if "T" in t_str:
                dt = datetime.datetime.fromisoformat(t_str.replace("Z", "+00:00"))
            else:
                dt = datetime.datetime.strptime(t_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
            else:
                dt = dt.astimezone(datetime.timezone.utc)
        except Exception:
            continue

        diff_sec = (dt - now_utc).total_seconds()
        diff_min = int(diff_sec / 60)

        # Track nearest future high-impact event
        if impact == "High" and 0 <= diff_sec < min_future_sec:
            min_future_sec = diff_sec
            hours = int(diff_sec // 3600)
            mins = int((diff_sec % 3600) // 60)
            secs = int(diff_sec % 60)
            countdown_text = f"{hours:02d}h {mins:02d}m {secs:02d}s"
            next_high_event = {
                "title": ev.get("title"),
                "currency": c,
                "country": ev.get("country"),
                "impact": impact,
                "timeUtc": dt.strftime("%H:%M UTC"),
                "minutesUntil": diff_min,
                "secondsUntil": int(diff_sec),
                "countdownText": countdown_text,
                "forecast": ev.get("forecast") or "--",
                "previous": ev.get("previous") or "--",
            }

        # Check for active blackout lockout: -15 min to +15 min
        if impact == "High" and -15 <= diff_min <= 15:
            active_high_event = (ev, diff_min)

        # Check for pre-news warning: 15m to 45m before
        if impact == "High" and 15 < diff_min <= 45 and not approaching_high_event:
            approaching_high_event = (ev, diff_min)

        # Check for post-news cooling buffer: -30m to -15m
        if impact == "High" and -30 <= diff_min < -15 and not cooling_high_event:
            cooling_high_event = (ev, diff_min)

        # Include events within -6 hours to +18 hours for the deck timeline
        if -6 * 3600 <= diff_sec <= 18 * 3600:
            relevant_events.append({
                "title": ev.get("title"),
                "currency": c,
                "country": ev.get("country"),
                "impact": impact,
                "timeUtc": dt.strftime("%H:%M UTC"),
                "minutesUntil": diff_min,
                "isPast": diff_sec < 0,
                "forecast": ev.get("forecast") or "--",
                "previous": ev.get("previous") or "--",
            })

    relevant_events.sort(key=lambda x: x["minutesUntil"])

    # Determine Spike Guard Status & Lockout
    if active_high_event:
        ev, m = active_high_event
        guard_status = "BLACKOUT_LOCKED"
        badge = "🚨 NO-TRADE BLACKOUT LOCKED"
        badge_color = "rose"
        is_locked = True
        if m >= 0:
            warning = f"HIGH-IMPACT NEWS RELEASE IN {m}m: {ev.get('title')} ({ev.get('currency')}). Trading lockout active! Extreme spread & slippage risk."
            guidance_bn = f"🚨 রেড ফোল্ডার সতর্কতা: {ev.get('title')} রিলিজ হতে আর মাত্র {m} মিনিট বাকি। এক্সনেস স্প্রেড অস্বাভাবিক বৃদ্ধি এবং স্লিপেজের ঝুঁকি রয়েছে। নতুন মার্কেট অর্ডার নেওয়া থেকে বিরত থাকুন।"
        else:
            warning = f"HIGH VOLATILITY RELEASE: {ev.get('title')} ({ev.get('currency')}) released {abs(m)}m ago! Wild whipsaw wicks active."
            guidance_bn = f"🚨 সংবাদ রিলিজ হয়েছে ({abs(m)} মিনিট আগে): মার্কেট এখনো অস্থির। উভয় দিকে ফেক লিকুইডিটি সুইপ হতে পারে। ক্যান্ডেল শান্ত হওয়া পর্যন্ত অপেক্ষা করুন।"
    elif approaching_high_event:
        ev, m = approaching_high_event
        guard_status = "PRE_NEWS_WARNING"
        badge = "⚠️ PRE-NEWS BUFFER (TIGHTEN STOPS)"
        badge_color = "amber"
        is_locked = False
        warning = f"UPCOMING RED FOLDER: {ev.get('title')} ({ev.get('currency')}) in {m}m. Institutional orderflow drying up; protect open profits."
        guidance_bn = f"⚠️ প্রি-নিউজ বাফার: আগামী {m} মিনিটের মধ্যে {ev.get('title')} আসছে। ওপেন ট্রেডের প্রফিট লক করুন বা স্টপ লস ব্রেক-ইভেনে নিয়ে আসুন।"
    elif cooling_high_event:
        ev, m = cooling_high_event
        guard_status = "COOLING_OFF"
        badge = "🔄 POST-NEWS COOLING (WAIT 15M CLOSE)"
        badge_color = "blue"
        is_locked = False
        warning = f"POST-NEWS DIGESTION: {ev.get('title')} released {abs(m)}m ago. Wait for 15m candle close before executing SMC setups."
        guidance_bn = f"🔄 পোস্ট-নিউজ ডাইজেস্শন: নিউজ পরবর্তী অস্থিরতা প্রশমিত হচ্ছে। নিশ্চিত SMC স্ট্রাকচার পেতে ১৫ মিনিট ক্যান্ডেল ক্লোজের জন্য অপেক্ষা করুন।"
    elif spread_data["status"] == "BLOWN":
        guard_status = "SPREAD_ALERT"
        badge = "⚠️ SPREAD SPIKE DETECTED"
        badge_color = "rose"
        is_locked = True
        warning = f"Dynamic Spread Warning: Live spread ({spread_data['liveSpread']}) is {spread_data['multiplier']}x normal baseline ({spread_data['typicalSpread']}). High execution cost!"
        guidance_bn = f"⚠️ স্প্রেড স্পাইক সতর্কতা: বর্তমান স্প্রেড সাধারণ স্প্রেডের চেয়ে {spread_data['multiplier']} গুণ বেশি। মার্কেট অর্ডার নেওয়ার আগে অপেক্ষা করুন।"
    else:
        guard_status = "CLEAR"
        badge = "🟢 CLEAR AIR • SAFE FOR EXECUTION"
        badge_color = "emerald"
        is_locked = False
        warning = None
        guidance_bn = f"🟢 ক্লিয়ার মার্কেট: কোনো নিকটবর্তী হাই-ইমপ্যাক্ট রেড ফোল্ডার নিউজ নেই। স্প্রেড অনুকূল ({spread_data['liveSpread']} {spread_data['unit']})। আপনার SMC স্ট্র্যাটেজি অনুযায়ী ট্রেড নিতে পারেন।"

    # Quick spread status for all supported symbols from batch cache
    all_spreads = fetch_all_spreads()
    all_symbols_summary = {}
    for s, sp in all_spreads.items():
        all_symbols_summary[s] = {
            "liveSpread": sp["liveSpread"],
            "typicalSpread": sp["typicalSpread"],
            "multiplier": sp["multiplier"],
            "status": sp["status"],
            "unit": sp["unit"],
            "costPerLotUsd": sp["costPerLotUsd"],
        }

    return {
        "symbol": sym,
        "currencies": target_currencies,
        "guardStatus": guard_status,
        "badge": badge,
        "badgeColor": badge_color,
        "isTradeLocked": is_locked,
        "warning": warning,
        "guidanceBn": guidance_bn,
        "spread": spread_data,
        "nextHighImpactEvent": next_high_event,
        "upcomingEvents": relevant_events,
        "allSymbolsSpread": all_symbols_summary,
        "timestamp": now_utc.isoformat(),
    }
