import sqlite3
import time
from typing import Any, Dict, List, Optional
from app import config
from app.db import get_connection
from app.strategies import calc_net_rr


def log_signal(
    symbol: str,
    strategy: str,
    side: str,
    entry: float,
    sl: float,
    tp: float,
    score: int,
    created_at: int,
    db_path: Optional[str] = None,
) -> Optional[int]:
    """
    Inserts a new open signal into the SQLite database.
    Ignores duplicates for (symbol, strategy, created_at).
    """
    conn = get_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR IGNORE INTO signals
            (symbol, strategy, side, entry, sl, tp, score, created_at, status, closed_at, result_r)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL)
            """,
            (symbol.upper(), strategy, side.upper(), entry, sl, tp, score, created_at),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def update_open_signals_on_candle(
    symbol: str,
    candle_ts: int,
    o: float,
    h: float,
    l: float,
    c: float,
    db_path: Optional[str] = None,
) -> int:
    """
    Evaluates all open signals for the given symbol against the newly closed 15m candle.
    Rules:
    - Stop-first if both stop and target are touched in the same candle.
    - Otherwise target if target is touched.
    - If bars held >= SIGNAL_EXPIRY_BARS (32), force-close at candle close.
    Returns the count of signals closed.
    """
    conn = get_connection(db_path)
    closed_count = 0
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, strategy, side, entry, sl, tp, created_at
            FROM signals
            WHERE symbol = ? AND status = 'open'
            """,
            (symbol.upper(),),
        )
        open_signals = cursor.fetchall()
        if not open_signals:
            return 0

        for row in open_signals:
            sig_id = row["id"]
            side = row["side"].upper()
            entry = float(row["entry"])
            sl = float(row["sl"])
            tp = float(row["tp"])
            created_at = int(row["created_at"])

            # Don't evaluate on the exact same bar that created the signal
            if candle_ts <= created_at:
                continue

            bars_held = (candle_ts - created_at) // (15 * 60 * 1000)

            # Determine stop and target touches
            if side == "BUY":
                stop_touched = l <= sl
                target_touched = h >= tp
            else:  # SELL
                stop_touched = h >= sl
                target_touched = l <= tp

            rr_net = calc_net_rr(entry, sl, tp)
            risk = abs(entry - sl)
            cost = entry * 2.0 * (config.TAKER_FEE + config.SLIPPAGE)
            denom = risk + cost if (risk + cost) > 0 else 1.0

            should_close = False
            result_r = 0.0

            # 1. Same candle stop-first priority
            if stop_touched and target_touched:
                should_close = True
                result_r = -1.0
            # 2. Stop loss touched
            elif stop_touched:
                should_close = True
                result_r = -1.0
            # 3. Target profit touched
            elif target_touched:
                should_close = True
                result_r = rr_net
            # 4. Max bars held reached
            elif bars_held >= config.SIGNAL_EXPIRY_BARS:
                should_close = True
                if side == "BUY":
                    pnl = c - entry - cost
                else:
                    pnl = entry - c - cost
                result_r = round(pnl / denom, 2)

            if should_close:
                cursor.execute(
                    """
                    UPDATE signals
                    SET status = 'closed', closed_at = ?, result_r = ?
                    WHERE id = ?
                    """,
                    (candle_ts, result_r, sig_id),
                )
                closed_count += 1

        conn.commit()
        return closed_count
    finally:
        conn.close()


def get_signals_log(
    symbol: Optional[str] = None,
    limit: int = 50,
    db_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Returns recent signals log and summary stats:
    {
      "signals": [...],
      "stats": { "count": int, "winRate": float, "avgR": float, "expectancy": float }
    }
    """
    conn = get_connection(db_path)
    try:
        cursor = conn.cursor()
        query = "SELECT id, symbol, strategy, side, entry, sl, tp, score, created_at, status, closed_at, result_r FROM signals"
        params: List[Any] = []
        if symbol:
            query += " WHERE symbol = ?"
            params.append(symbol.upper())
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        rows = cursor.fetchall()

        signals_list = []
        for r in rows:
            signals_list.append({
                "id": r["id"],
                "symbol": r["symbol"],
                "strategy": r["strategy"],
                "side": r["side"],
                "entry": float(r["entry"]),
                "sl": float(r["sl"]),
                "tp": float(r["tp"]),
                "score": int(r["score"]) if r["score"] is not None else 0,
                "createdAt": int(r["created_at"]),
                "status": r["status"],
                "closedAt": int(r["closed_at"]) if r["closed_at"] is not None else None,
                "resultR": float(r["result_r"]) if r["result_r"] is not None else None,
            })

        # Calculate live stats over all closed signals
        stats_query = "SELECT result_r FROM signals WHERE status = 'closed'"
        stats_params: List[Any] = []
        if symbol:
            stats_query += " AND symbol = ?"
            stats_params.append(symbol.upper())

        cursor.execute(stats_query, stats_params)
        closed_rows = cursor.fetchall()

        total_closed = len(closed_rows)
        if total_closed == 0:
            stats = {
                "count": 0,
                "winRate": 0.0,
                "avgR": 0.0,
                "expectancy": 0.0,
            }
        else:
            rs = [float(r["result_r"]) for r in closed_rows if r["result_r"] is not None]
            wins = [r for r in rs if r > 0]
            losses = [r for r in rs if r <= 0]

            win_count = len(wins)
            win_rate = round((win_count / total_closed) * 100.0, 1)
            avg_r = round(sum(rs) / total_closed, 2)

            avg_win = sum(wins) / len(wins) if wins else 0.0
            avg_loss = abs(sum(losses) / len(losses)) if losses else 0.0
            win_pct = win_count / total_closed
            loss_pct = 1.0 - win_pct
            expectancy = round((win_pct * avg_win) - (loss_pct * avg_loss), 2)

            stats = {
                "count": total_closed,
                "winRate": win_rate,
                "avgR": avg_r,
                "expectancy": expectancy,
            }

        return {
            "signals": signals_list,
            "stats": stats,
        }
    finally:
        conn.close()
