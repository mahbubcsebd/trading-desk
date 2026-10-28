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
        for row in cursor.fetchall():
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

    # 2. Edge: clamp(profit_factor - 1, 0, 1)
    edge = min(max(oos_profit_factor - 1.0, 0.0), 1.0)

    # 3. Flow: 4 components in [-1, 1], mapped to [0, 1]
    # c1: bookImbalance * d
    book_imb = float(liquidity.get("bookImbalance", 0.0))
    c1 = min(max(book_imb * d, -1.0), 1.0)

    # c2: ((takerBuyPct - 50) / 50) * d
    taker_pct = float(liquidity.get("takerBuyPct", 50.0))
    c2 = min(max(((taker_pct - 50.0) / 50.0) * d, -1.0), 1.0)

    # c3: OI confirmation
    # OI rising with price moving in d = +1, OI rising with price against d = -1, else 0
    oi_change = float(liquidity.get("oiChange15mPct", 0.0))
    price_change = price - candle_open
    c3 = 0.0
    if oi_change > 0:
        if price_change * d > 0:
            c3 = 1.0
        elif price_change * d < 0:
            c3 = -1.0

    # c4: wall block
    # an opposing wall between entry and target = -1, else 0
    c4 = 0.0
    buy_wall = liquidity.get("buyWall")
    sell_wall = liquidity.get("sellWall")
    if d == 1:
        # Long trade: opposing wall is sell wall
        if sell_wall and isinstance(sell_wall, dict) and "price" in sell_wall:
            wall_price = float(sell_wall["price"])
            if signal.entry < wall_price <= signal.tp:
                c4 = -1.0
    else:
        # Short trade: opposing wall is buy wall
        if buy_wall and isinstance(buy_wall, dict) and "price" in buy_wall:
            wall_price = float(buy_wall["price"])
            if signal.tp <= wall_price < signal.entry:
                c4 = -1.0

    raw_flow = (c1 + c2 + c3 + c4) / 4.0
    flow = min(max((raw_flow + 1.0) / 2.0, 0.0), 1.0)

    # 4. Regime: 1 if strategy fits regime, else 0
    regime_state = regime.get("state", "ranging")
    if signal.strategy_id == "trend":
        regime_fit = 1.0 if regime_state == "trending" else 0.0
    elif signal.strategy_id == "reversion":
        regime_fit = 1.0 if regime_state == "ranging" else 0.0
    elif signal.strategy_id == "sweep":
        regime_fit = 1.0
    else:
        regime_fit = 0.0

    # 5. R:R: min(rr_net / 3, 1)
    rr_comp = min(max(signal.rr_net / 3.0, 0.0), 1.0)

    raw_score = 100.0 * (
        w["align"] * align
        + w["edge"] * edge
        + w["flow"] * flow
        + w["regime"] * regime_fit
        + w["rr"] * rr_comp
    )
    score = int(round(raw_score))
    score = min(max(score, 0), 100)

    reasons: List[Dict[str, Any]] = []
    # Up to 5 concise reasons with point contributions
    align_pts = int(round(100.0 * w["align"] * align))
    if align >= 0.6:
        reasons.append({"label": "4h and 1h trend aligned", "points": align_pts})
    elif align > 0:
        reasons.append({"label": "Partial trend alignment", "points": align_pts})
    else:
        reasons.append({"label": "Counter-trend / Neutral bias", "points": 0})

    edge_pts = int(round(100.0 * w["edge"] * edge))
    if edge > 0:
        reasons.append({"label": f"Backtested edge (PF {oos_profit_factor:.2f})", "points": edge_pts})

    flow_pts = int(round(100.0 * w["flow"] * flow))
    if flow >= 0.5:
        reasons.append({"label": "Order book & taker flow support", "points": flow_pts})
    else:
        reasons.append({"label": "Flow / wall resistance", "points": flow_pts})

    regime_pts = int(round(100.0 * w["regime"] * regime_fit))
    if regime_fit > 0:
        reasons.append({"label": f"Matches {regime_state} regime", "points": regime_pts})

    rr_pts = int(round(100.0 * w["rr"] * rr_comp))
    reasons.append({"label": f"Net R:R {signal.rr_net:.2f} edge", "points": rr_pts})

    components = {
        "align": align,
        "edge": edge,
        "flow": flow,
        "regime": regime_fit,
        "rr": rr_comp,
    }

    return score, reasons[:5], components


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
    has_any_backtest = any(b.get("profit_factor", 0.0) > 0 for b in backtest_info.values())

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
        return {
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
            "waitReason": "No strategy has a valid setup",
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
