"""
correlation.py — Currency Correlation Engine & Portfolio Risk Shield.
Computes live Pearson correlation matrix across all 7 instruments (XAUUSD, EURUSD, GBPUSD, USDJPY, US30, NAS100, BTCUSD),
calculates Net Currency Exposure (USD, EUR, GBP, JPY, Gold, Indices, Crypto),
and enforces the Automated Daily Drawdown Circuit Breaker.
"""

import logging
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd

from app import config, db

logger = logging.getLogger("correlation")

# Currency components mapped to instruments
# e.g. BUY EURUSD = Long EUR (+1), Short USD (-1)
# e.g. SELL USDJPY = Short USD (-1), Long JPY (+1)
# e.g. BUY XAUUSD = Long XAU (+1), Short USD (-1)
INSTRUMENT_CURRENCY_MAP = {
    "XAUUSD": {"base": "XAU", "quote": "USD"},
    "EURUSD": {"base": "EUR", "quote": "USD"},
    "GBPUSD": {"base": "GBP", "quote": "USD"},
    "USDJPY": {"base": "USD", "quote": "JPY"},
    "US30":   {"base": "US30", "quote": "USD"},
    "NAS100": {"base": "NAS100", "quote": "USD"},
    "BTCUSD": {"base": "BTC", "quote": "USD"},
}


def compute_live_correlation_matrix(state_obj, bars_count: int = 80) -> Dict[str, Any]:
    """
    Computes real-time Pearson correlation matrix for all 7 instruments using 1H close returns.
    """
    symbols = config.SYMBOLS
    series_dict: Dict[str, pd.Series] = {}

    for sym in symbols:
        sym_state = state_obj.get_symbol(sym)
        if not sym_state:
            continue
        candles = sym_state.candles.get("1h", [])
        if len(candles) >= 20:
            closes = [float(c[4]) for c in candles[-bars_count:]]
            s = pd.Series(closes).pct_change().dropna()
            series_dict[sym] = s

    if len(series_dict) < 2:
        return {
            "matrix": {},
            "pairs": [],
            "status": "BUILDING_SERIES",
        }

    # Align series lengths
    df_returns = pd.DataFrame(series_dict).dropna()
    corr_df = df_returns.corr()

    matrix_dict: Dict[str, Dict[str, float]] = {}
    pair_relationships: List[Dict[str, Any]] = []

    for s1 in symbols:
        matrix_dict[s1] = {}
        for s2 in symbols:
            if s1 in corr_df.columns and s2 in corr_df.columns:
                val = round(float(corr_df.loc[s1, s2]), 2)
            else:
                val = 1.0 if s1 == s2 else 0.0
            matrix_dict[s1][s2] = val

            # Add unique non-identical pair relationship
            if s1 < s2:
                if val >= 0.70:
                    rel_type = "STRONG_POSITIVE"
                    advice = "Duplicate risk. Avoid opening both in the same direction."
                    badge_color = "rose"
                elif val <= -0.70:
                    rel_type = "STRONG_INVERSE"
                    advice = "Direct hedge / opposite correlation. Taking same direction cancels profit."
                    badge_color = "amber"
                elif 0.30 <= val < 0.70:
                    rel_type = "MODERATE_POSITIVE"
                    advice = "Moderate positive correlation. Mind overall exposure."
                    badge_color = "emerald"
                elif -0.70 < val <= -0.30:
                    rel_type = "MODERATE_INVERSE"
                    advice = "Moderate inverse correlation."
                    badge_color = "cyan"
                else:
                    rel_type = "INDEPENDENT"
                    advice = "Uncorrelated / Excellent diversification."
                    badge_color = "zinc"

                pair_relationships.append({
                    "pair": f"{s1} / {s2}",
                    "s1": s1,
                    "s2": s2,
                    "correlation": val,
                    "type": rel_type,
                    "advice": advice,
                    "badgeColor": badge_color,
                })

    # Sort pair relationships by absolute correlation magnitude
    pair_relationships.sort(key=lambda x: abs(x["correlation"]), reverse=True)

    return {
        "symbols": symbols,
        "matrix": matrix_dict,
        "keyRelationships": pair_relationships,
        "status": "ACTIVE",
    }


def compute_portfolio_risk_shield(state_obj) -> Dict[str, Any]:
    """
    Computes complete Portfolio Risk Shield, Net Currency Exposure,
    and Automated Daily Drawdown Circuit Breaker status.
    """
    # 1. Fetch live settings & journal stats
    settings = db.get_settings()
    balance = float(settings.get("balance", "10000.0"))
    daily_limit_pct = float(settings.get("daily_limit_pct", "3.0"))
    max_portfolio_risk_pct = float(settings.get("max_portfolio_risk_pct", "3.0"))

    journal_stats = db.get_journal_stats()
    today_pnl_usd = journal_stats.get("todayPnlUsd", 0.0)
    trades_count = journal_stats.get("trades", 0)

    # 2. Drawdown & Circuit Breaker Logic
    max_daily_loss_usd = round(balance * (daily_limit_pct / 100.0), 2)
    current_loss_usd = abs(min(0.0, today_pnl_usd))
    remaining_drawdown_usd = max(0.0, round(max_daily_loss_usd - current_loss_usd, 2))
    drawdown_used_pct = round((current_loss_usd / max_daily_loss_usd) * 100.0, 1) if max_daily_loss_usd > 0 else 0.0

    is_circuit_breaker_tripped = today_pnl_usd < 0 and current_loss_usd >= max_daily_loss_usd
    is_nearing_breaker = not is_circuit_breaker_tripped and drawdown_used_pct >= 75.0

    if is_circuit_breaker_tripped:
        circuit_status = "TRIPPED"
        circuit_badge = "CIRCUIT BREAKER TRIPPED"
        circuit_color = "rose"
        circuit_message = (
            f"Daily loss limit reached (-${current_loss_usd:.2f} / -{daily_limit_pct}%). "
            f"Trading is locked to protect remaining capital. Walk away until tomorrow's Tokyo open."
        )
    elif is_nearing_breaker:
        circuit_status = "WARNING"
        circuit_badge = "NEAR DAILY DRAWDOWN LIMIT"
        circuit_color = "amber"
        circuit_message = (
            f"Warning: {drawdown_used_pct}% of daily loss limit consumed (-${current_loss_usd:.2f} / -${max_daily_loss_usd:.2f}). "
            f"Only ${remaining_drawdown_usd:.2f} buffer remains."
        )
    else:
        circuit_status = "PROTECTED"
        circuit_badge = "SHIELD ACTIVE • SAFE"
        circuit_color = "emerald"
        circuit_message = f"Daily risk intact. ${remaining_drawdown_usd:.2f} allowable loss buffer remaining."

    # 3. Correlation Matrix
    corr_data = compute_live_correlation_matrix(state_obj)

    # 4. Open / Active Setup Risk Analysis
    active_setups = []
    net_exposure: Dict[str, float] = {
        "USD": 0.0,
        "EUR": 0.0,
        "GBP": 0.0,
        "JPY": 0.0,
        "XAU": 0.0,
        "INDICES": 0.0,
        "BTC": 0.0,
    }
    total_committed_risk_usd = 0.0

    for sym in config.SYMBOLS:
        sym_state = state_obj.get_symbol(sym)
        if not sym_state:
            continue
        setup = sym_state.current_setup
        if setup and setup.get("action") in ("BUY", "SELL"):
            side = setup["action"]
            risk_usd = float(setup.get("riskUsd", balance * 0.01))
            total_committed_risk_usd += risk_usd
            active_setups.append({
                "symbol": sym,
                "side": side,
                "score": setup.get("score", 0),
                "riskUsd": risk_usd,
            })

            # Calculate currency direction
            rule = INSTRUMENT_CURRENCY_MAP.get(sym, {"base": sym, "quote": "USD"})
            base = rule["base"]
            quote = rule["quote"]

            if side == "BUY":
                if base in net_exposure: net_exposure[base] += 1.0
                elif base in ("US30", "NAS100"): net_exposure["INDICES"] += 1.0
                if quote in net_exposure: net_exposure[quote] -= 1.0
            else:
                if base in net_exposure: net_exposure[base] -= 1.0
                elif base in ("US30", "NAS100"): net_exposure["INDICES"] -= 1.0
                if quote in net_exposure: net_exposure[quote] += 1.0

    total_committed_risk_pct = round((total_committed_risk_usd / balance) * 100.0, 2) if balance > 0 else 0.0

    # Portfolio Heat Level
    if total_committed_risk_pct > max_portfolio_risk_pct:
        portfolio_heat = "HIGH_RISK"
        heat_color = "rose"
    elif total_committed_risk_pct > 1.5:
        portfolio_heat = "ELEVATED"
        heat_color = "amber"
    else:
        portfolio_heat = "OPTIMAL"
        heat_color = "emerald"

    # Currency Clash Warnings
    warnings = []
    if abs(net_exposure["USD"]) >= 2.0:
        dir_label = "Short" if net_exposure["USD"] < 0 else "Long"
        warnings.append({
            "type": "CONCENTRATED_USD_RISK",
            "message": f"Extreme {dir_label} USD concentration ({abs(net_exposure['USD'])}x exposure across multiple pairs). A single USD news spike will hit all positions simultaneously.",
            "severity": "HIGH",
        })

    if net_exposure["EUR"] > 0 and net_exposure["GBP"] > 0:
        warnings.append({
            "type": "CORRELATED_EUROPEAN_EXPOSURE",
            "message": "Simultaneous Long EUR and Long GBP detected. Correlation is +0.88; treat as a single aggregated exposure.",
            "severity": "MEDIUM",
        })

    return {
        "account": {
            "balance": balance,
            "dailyLimitPct": daily_limit_pct,
            "maxPortfolioRiskPct": max_portfolio_risk_pct,
            "todayPnlUsd": today_pnl_usd,
            "tradesCount": trades_count,
        },
        "circuitBreaker": {
            "status": circuit_status,
            "badge": circuit_badge,
            "badgeColor": circuit_color,
            "isTripped": is_circuit_breaker_tripped,
            "isNearingBreaker": is_nearing_breaker,
            "drawdownUsedPct": drawdown_used_pct,
            "maxDailyLossUsd": max_daily_loss_usd,
            "currentLossUsd": current_loss_usd,
            "remainingDrawdownUsd": remaining_drawdown_usd,
            "message": circuit_message,
        },
        "portfolioHeat": {
            "status": portfolio_heat,
            "heatColor": heat_color,
            "totalCommittedRiskPct": total_committed_risk_pct,
            "totalCommittedRiskUsd": round(total_committed_risk_usd, 2),
            "maxAllowedRiskPct": max_portfolio_risk_pct,
            "activeSetupsCount": len(active_setups),
            "activeSetups": active_setups,
        },
        "netCurrencyExposure": net_exposure,
        "warnings": warnings,
        "correlation": corr_data,
    }

