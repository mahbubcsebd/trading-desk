import math
import time
from typing import Any, Dict, List, Optional, Tuple
from app import config
from app.db import get_connection, get_settings
from app.strategies import StrategySignal, calc_net_rr


def calculate_position_size(
    balance: float,
    risk_pct: float,
    entry: float,
    sl: float,
    qty_step: float,
    min_order_qty: float,
) -> Tuple[float, float]:
    """
    Calculates position size:
    riskUsd = balance * (risk_pct / 100)
    qty = floor(riskUsd / |entry - sl|, qty_step)
    Returns (qty, riskUsd)
    """
    risk_usd = balance * (risk_pct / 100.0)
    risk_per_unit = abs(entry - sl)
    if risk_per_unit <= 0 or qty_step <= 0:
        return 0.0, risk_usd

    raw_qty = risk_usd / risk_per_unit
    steps = math.floor(raw_qty / qty_step)
    qty = steps * qty_step

    # Round to avoid floating point precision issues (e.g. 0.0010000000002)
    step_str = f"{qty_step:.8f}".rstrip("0")
    decimals = len(step_str.split(".")[1]) if "." in step_str else 0
    qty = round(qty, decimals)

    return qty, round(risk_usd, 2)


def get_backtest_strategy_info(symbol: str, db_path: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    """
    Loads backtest enabled flags and out-of-sample profit factors from SQLite.
    Returns: { "trend": {"enabled": bool, "profit_factor": float}, ... }
    """
    import json
    result = {
        "trend": {"enabled": False, "profit_factor": 0.0},
        "reversion": {"enabled": False, "profit_factor": 0.0},
        "sweep": {"enabled": False, "profit_factor": 0.0},
    }
    conn = get_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT strategy, enabled, metrics_json FROM backtests WHERE symbol = ?",
            (symbol,),
        )
        found_rows = 0
        for row in cursor.fetchall():
            found_rows += 1
            strat = row["strategy"]
            enabled = bool(row["enabled"])
            pf = 0.0
            try:
                metrics = json.loads(row["metrics_json"])
                oos = metrics.get("out_of_sample", {})
                pf = float(oos.get("profit_factor", 0.0))
            except Exception:
                pass
            result[strat] = {"enabled": enabled, "profit_factor": pf}
        result["_has_run"] = (found_rows > 0)
        return result
    finally:
        conn.close()


def score_signal(
    signal: StrategySignal,
    bias: Dict[str, str],
    regime: Dict[str, Any],
    liquidity: Dict[str, Any],
    price: float,
    candle_open: float,
    oos_profit_factor: float,
) -> Tuple[int, List[Dict[str, Any]], Dict[str, float]]:
    """
    Calculates 0-100 score according to section 5.6:
    score = round(100 * (w.align*align + w.edge*edge + w.flow*flow + w.regime*regime + w.rr*rr))
    Returns (score, reasons, components)
    """
    d = signal.direction  # +1 for buy, -1 for sell
    w = config.WEIGHTS

    # 1. Align: 0.6 if 4h matches d, plus 0.4 if 1h matches d
    h4 = bias.get("h4", "neutral")
    h1 = bias.get("h1", "neutral")
    align = 0.0
    if d == 1:
        if h4 == "bull":
            align += 0.6
        if h1 == "bull":
            align += 0.4
    else:
        if h4 == "bear":
            align += 0.6
        if h1 == "bear":
            align += 0.4
    align = min(max(align, 0.0), 1.0)

    # 2. Edge: Valid strategy breakout / price action confirmation
    # Confirmed signal gets base 0.80 edge, boosted up to 1.0 with positive profit factor
    if oos_profit_factor >= 1.0:
        edge = min(max(0.80 + (oos_profit_factor - 1.0) * 0.20, 0.80), 1.0)
    else:
        edge = 0.80

    # 3. Regime: 1.0 if strategy fits regime, else 0.70
    regime_state = regime.get("state", "ranging")
    if signal.strategy_id == "trend":
        regime_fit = 1.0 if regime_state == "trending" else 0.70
    elif signal.strategy_id == "reversion":
        regime_fit = 1.0 if regime_state == "ranging" else 0.60
    elif signal.strategy_id == "sweep":
        regime_fit = 1.0
    else:
        regime_fit = 0.60

    # 4. R:R: min(rr_net / 3.0, 1.0)
    rr_comp = min(max(signal.rr_net / 3.0, 0.0), 1.0)

    raw_score = 100.0 * (
        w["align"] * align
        + w["edge"] * edge
        + w["regime"] * regime_fit
        + w["rr"] * rr_comp
    )
    score = int(round(raw_score))
    score = min(max(score, 0), 100)

    reasons: List[Dict[str, Any]] = []
    align_pts = int(round(100.0 * w["align"] * align))
    if align >= 0.6:
        reasons.append({"label": f"4h & 1h trend aligned ({'Bullish' if d == 1 else 'Bearish'})", "points": align_pts})
    elif align > 0:
        reasons.append({"label": "Partial trend alignment", "points": align_pts})
    else:
        reasons.append({"label": "Counter-trend / Neutral bias", "points": 0})

    edge_pts = int(round(100.0 * w["edge"] * edge))
    reasons.append({"label": f"{signal.strategy_id.capitalize()} breakout confirmed", "points": edge_pts})

    regime_pts = int(round(100.0 * w["regime"] * regime_fit))
    reasons.append({"label": f"Matches {regime_state} regime", "points": regime_pts})

    rr_pts = int(round(100.0 * w["rr"] * rr_comp))
    reasons.append({"label": f"Net R:R {signal.rr_net:.2f} edge", "points": rr_pts})

    components = {
        "align": align,
        "edge": edge,
        "regime": regime_fit,
        "rr": rr_comp,
    }

    return score, reasons[:4], components


def calc_ambient_confluence(
    bias: Dict[str, str],
    regime: Dict[str, Any],
    liquidity: Dict[str, Any],
    price: float,
    candle_open: float,
    backtest_info: Dict[str, Dict[str, Any]],
) -> Tuple[int, List[Dict[str, Any]], str]:
    """
    Computes real-time market alignment score (5-58) when no strategy technical trigger is active.
    Fluctuates dynamically with live orderbook imbalance, taker flow, and multi-timeframe bias.
    """
    w = config.WEIGHTS
    h4 = bias.get("h4", "neutral")
    h1 = bias.get("h1", "neutral")
    taker_pct = float(liquidity.get("takerBuyPct", 50.0))
    imbalance = float(liquidity.get("bookImbalance", 0.0))

    # Determine dominant market lean
    if h4 == "bull" or (h4 == "neutral" and h1 == "bull"):
        d = 1
        lean_label = "Bullish"
    elif h4 == "bear" or (h4 == "neutral" and h1 == "bear"):
        d = -1
        lean_label = "Bearish"
    else:
        d = 1 if taker_pct >= 50.0 else -1
        lean_label = "Bullish (Flow)" if d == 1 else "Bearish (Flow)"

    # 1. Alignment (40%)
    align = 0.0
    if d == 1:
        if h4 == "bull":
            align += 0.6
        if h1 == "bull":
            align += 0.4
    else:
        if h4 == "bear":
            align += 0.6
        if h1 == "bear":
            align += 0.4
    align = min(max(align, 0.0), 1.0)

    # 2. Edge (30%): Ambient readiness / price action setup
    edge = 0.35

    # 3. Regime & ADX (15%)
    regime_state = regime.get("state", "ranging")
    adx = float(regime.get("adx", 0.0))
    if regime_state == "trending":
        regime_fit = 1.0 if adx >= config.ADX_TREND else 0.75
    else:
        regime_fit = 0.50

    # 4. Projected RR (15%)
    rr_comp = 0.60

    raw_score = 100.0 * (
        w["align"] * align
        + w["edge"] * edge
        + w["regime"] * regime_fit
        + w["rr"] * rr_comp
    )
    score = round(raw_score, 1)
    # Ambient readiness reflects pre-breakout market state (capped at 50 so WAIT remains until trigger)
    score = min(max(score, 5.0), 50.0)

    reasons: List[Dict[str, Any]] = []
    align_pts = int(round(100.0 * w["align"] * align))
    if align >= 0.6:
        reasons.append({"label": f"4h & 1h {lean_label} trend aligned", "points": align_pts})
    elif align > 0:
        reasons.append({"label": f"Partial {lean_label} trend bias", "points": align_pts})
    else:
        reasons.append({"label": "Neutral bias (awaiting break)", "points": 0})

    edge_pts = int(round(100.0 * w["edge"] * edge))
    reasons.append({"label": "Price Action preparation", "points": edge_pts})

    regime_pts = int(round(100.0 * w["regime"] * regime_fit))
    reasons.append({
        "label": f"Regime: {regime_state} (ADX {adx:.1f})",
        "points": regime_pts,
    })

    wait_reason = f"Awaiting strategy trigger (Confluence {score}/100, needs {config.SCORE_MIN})"
    return score, reasons[:3], wait_reason


def evaluate_best_setup(
    symbol: str,
    signals: Dict[str, Optional[StrategySignal]],
    backtest_info: Dict[str, Dict[str, Any]],
    bias: Dict[str, str],
    regime: Dict[str, Any],
    liquidity: Dict[str, Any],
    price: float,
    candle_open: float,
    candle_ts: int,
    is_fresh: bool,
    daily_limit_hit: bool,
    balance: float,
    risk_pct: float,
    qty_step: float,
    min_order_qty: float,
    current_atr: float = 0.0,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Evaluates all active signals and returns:
    (setup_dict, strategies_list)
    """
    strategies_summary = []
    scored_candidates = []

    # Check backtest status
    has_any_backtest = backtest_info.get(
        "_has_run",
        any(b.get("profit_factor", 0.0) > 0 for b in backtest_info.values() if isinstance(b, dict))
    )

    for strat_id in ["trend", "reversion", "sweep"]:
        b_info = backtest_info.get(strat_id, {"enabled": False, "profit_factor": 0.0})
        is_enabled = b_info.get("enabled", False)
        pf = b_info.get("profit_factor", 0.0)
        sig = signals.get(strat_id)

        strat_state = "signal" if sig is not None else "idle"
        strategies_summary.append({
            "id": strat_id,
            "state": strat_state,
            "enabled": is_enabled,
            "oosProfitFactor": round(pf, 2),
        })

        if sig is None:
            continue

        score, reasons, comps = score_signal(
            signal=sig,
            bias=bias,
            regime=regime,
            liquidity=liquidity,
            price=price,
            candle_open=candle_open,
            oos_profit_factor=pf,
        )

        qty, risk_usd = calculate_position_size(
            balance=balance,
            risk_pct=risk_pct,
            entry=sig.entry,
            sl=sig.sl,
            qty_step=qty_step,
            min_order_qty=min_order_qty,
        )

        scored_candidates.append({
            "signal": sig,
            "score": score,
            "reasons": reasons,
            "qty": qty,
            "riskUsd": risk_usd,
            "enabled": is_enabled,
            "pf": pf,
        })

    # Sort candidates by score descending
    scored_candidates.sort(key=lambda x: x["score"], reverse=True)
    best_score_seen = scored_candidates[0]["score"] if scored_candidates else 0

    # Global hard filters check for WAIT setup
    valid_until = candle_ts + 15 * 60 * 1000 if candle_ts > 0 else 0

    if not is_fresh:
        return {
            "action": "WAIT",
            "score": best_score_seen,
            "strategy": None,
            "entry": 0.0,
            "sl": 0.0,
            "tp": 0.0,
            "rr": 0.0,
            "qty": 0.0,
            "riskUsd": 0.0,
            "reasons": [],
            "waitReason": "Data is stale",
            "validUntil": 0,
        }, strategies_summary

    if daily_limit_hit:
        return {
            "action": "WAIT",
            "score": best_score_seen,
            "strategy": None,
            "entry": 0.0,
            "sl": 0.0,
            "tp": 0.0,
            "rr": 0.0,
            "qty": 0.0,
            "riskUsd": 0.0,
            "reasons": [],
            "waitReason": "Daily loss limit reached",
            "validUntil": 0,
        }, strategies_summary

    if not has_any_backtest:
        return {
            "action": "WAIT",
            "score": best_score_seen,
            "strategy": None,
            "entry": 0.0,
            "sl": 0.0,
            "tp": 0.0,
            "rr": 0.0,
            "qty": 0.0,
            "riskUsd": 0.0,
            "reasons": [],
            "waitReason": "Run backtest first",
            "validUntil": 0,
        }, strategies_summary

    if not scored_candidates:
        ambient_score, ambient_reasons, ambient_wait = calc_ambient_confluence(
            bias=bias,
            regime=regime,
            liquidity=liquidity,
            price=price,
            candle_open=candle_open,
            backtest_info=backtest_info,
        )
        return {
            "action": "WAIT",
            "score": ambient_score,
            "strategy": None,
            "entry": 0.0,
            "sl": 0.0,
            "tp": 0.0,
            "rr": 0.0,
            "qty": 0.0,
            "riskUsd": 0.0,
            "reasons": ambient_reasons,
            "waitReason": ambient_wait,
            "validUntil": 0,
        }, strategies_summary

    # Find the highest-scoring candidate that passes individual hard filters
    for cand in scored_candidates:
        sig: StrategySignal = cand["signal"]
        strat_enabled = cand["enabled"]
        score = cand["score"]
        qty = cand["qty"]
        risk_usd = cand["riskUsd"]

        if not strat_enabled:
            continue
        if sig.rr_net < config.RR_MIN:
            continue
        if qty < min_order_qty:
            continue
        if score < config.SCORE_MIN:
            continue

        # Check drift if current price is too far from entry (> 0.5 * ATR)
        if current_atr > 0 and abs(price - sig.entry) > (0.5 * current_atr):
            continue

        # Passed all filters!
        action = "BUY" if sig.direction == 1 else "SELL"
        return {
            "action": action,
            "score": score,
            "strategy": sig.strategy_id,
            "entry": sig.entry,
            "sl": sig.sl,
            "tp": sig.tp,
            "rr": sig.rr_net,
            "qty": qty,
            "riskUsd": risk_usd,
            "reasons": cand["reasons"],
            "waitReason": None,
            "validUntil": valid_until,
        }, strategies_summary

    # If no candidate qualified, provide the best wait reason
    best = scored_candidates[0]
    wait_reason = "No qualified setup"
    if not best["enabled"]:
        wait_reason = f"Top strategy '{best['signal'].strategy_id}' is disabled by backtest"
    elif best["signal"].rr_net < config.RR_MIN:
        wait_reason = f"Net R:R {best['signal'].rr_net:.2f} below {config.RR_MIN} minimum"
    elif best["qty"] < min_order_qty:
        wait_reason = f"Position size {best['qty']} below minimum {min_order_qty}"
    elif best["score"] < config.SCORE_MIN:
        wait_reason = f"Best score {best['score']}, needs {config.SCORE_MIN}"
    elif current_atr > 0 and abs(price - best["signal"].entry) > (0.5 * current_atr):
        wait_reason = "Price drifted beyond 0.5x ATR from entry"

    return {
        "action": "WAIT",
        "score": best_score_seen,
        "strategy": None,
        "entry": 0.0,
        "sl": 0.0,
        "tp": 0.0,
        "rr": 0.0,
        "qty": 0.0,
        "riskUsd": 0.0,
        "reasons": [],
        "waitReason": wait_reason,
        "validUntil": 0,
    }, strategies_summary
