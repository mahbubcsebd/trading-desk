import sqlite3
import time
from typing import Any, Dict, List, Optional, Tuple
from app import config

SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS candles (
    symbol TEXT,
    tf TEXT,
    ts INTEGER,
    o REAL,
    h REAL,
    l REAL,
    c REAL,
    v REAL,
    PRIMARY KEY(symbol, tf, ts)
);

CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT,
    strategy TEXT,
    side TEXT,
    entry REAL,
    sl REAL,
    tp REAL,
    score INTEGER,
    created_at INTEGER,
    status TEXT,
    closed_at INTEGER,
    result_r REAL,
    UNIQUE(symbol, strategy, created_at)
);

CREATE TABLE IF NOT EXISTS backtests (
    symbol TEXT,
    strategy TEXT,
    run_at INTEGER,
    enabled INTEGER,
    metrics_json TEXT,
    PRIMARY KEY(symbol, strategy)
);

CREATE TABLE IF NOT EXISTS journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT,
    side TEXT,
    entry REAL,
    exit REAL,
    sl REAL,
    qty REAL,
    opened_at INTEGER,
    closed_at INTEGER,
    pnl_usd REAL,
    r_multiple REAL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""


def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or config.DB_PATH
    conn = sqlite3.connect(path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    conn = get_connection(db_path)
    try:
        conn.executescript(SCHEMA_SQL)
        # Seed default settings if empty
        defaults = {
            "balance": "10000.0",
            "risk_pct": "1.0",
            "daily_limit_pct": "3.0",
        }
        for k, v in defaults.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v)
            )
        conn.commit()
    finally:
        conn.close()


def save_candles(candles: List[Tuple[str, str, int, float, float, float, float, float]], db_path: Optional[str] = None) -> None:
    if not candles:
        return
    conn = get_connection(db_path)
    try:
        conn.executemany(
            """
            INSERT OR REPLACE INTO candles (symbol, tf, ts, o, h, l, c, v)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            candles,
        )
        conn.commit()
    finally:
        conn.close()


def get_candles(symbol: str, tf: str, limit: int = 500, db_path: Optional[str] = None) -> List[List[Any]]:
    conn = get_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT ts, o, h, l, c, v
            FROM candles
            WHERE symbol = ? AND tf = ?
            ORDER BY ts DESC
            LIMIT ?
            """,
            (symbol, tf, limit),
        )
        rows = cursor.fetchall()
        # Return oldest first: [[ts, o, h, l, c, v], ...]
        result = [[r["ts"], r["o"], r["h"], r["l"], r["c"], r["v"]] for r in reversed(rows)]
        return result
    finally:
        conn.close()


def get_settings(db_path: Optional[str] = None) -> Dict[str, str]:
    conn = get_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        return {row["key"]: row["value"] for row in cursor.fetchall()}
    finally:
        conn.close()


def set_setting(key: str, value: str, db_path: Optional[str] = None) -> None:
    conn = get_connection(db_path)
    try:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
        conn.commit()
    finally:
        conn.close()


def add_journal_trade(
    symbol: str,
    side: str,
    entry: float,
    exit_price: float,
    sl: float,
    qty: float,
    opened_at: Optional[int] = None,
    closed_at: Optional[int] = None,
    notes: str = "",
    db_path: Optional[str] = None,
) -> int:
    """
    Computes pnl_usd and r_multiple with fees/slippage and records the trade into journal.
    """
    now_ms = int(time.time() * 1000)
    op_at = opened_at or now_ms
    cl_at = closed_at or now_ms

    fee_slip = 2.0 * (config.TAKER_FEE + config.SLIPPAGE)
    cost_usd = entry * qty * fee_slip
    risk_per_unit = abs(entry - sl)
    denom = (risk_per_unit * qty) + cost_usd

    if side.upper() == "BUY":
        gross_pnl = (exit_price - entry) * qty
    else:
        gross_pnl = (entry - exit_price) * qty

    pnl_usd = round(gross_pnl - cost_usd, 2)
    r_multiple = round(pnl_usd / denom, 2) if denom > 0 else 0.0

    conn = get_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO journal
            (symbol, side, entry, exit, sl, qty, opened_at, closed_at, pnl_usd, r_multiple, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                symbol.upper(),
                side.upper(),
                entry,
                exit_price,
                sl,
                qty,
                op_at,
                cl_at,
                pnl_usd,
                r_multiple,
                notes,
            ),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_journal_trades(limit: int = 100, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, symbol, side, entry, exit, sl, qty, opened_at, closed_at, pnl_usd, r_multiple, notes
            FROM journal
            ORDER BY closed_at DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cursor.fetchall()
        return [
            {
                "id": r["id"],
                "symbol": r["symbol"],
                "side": r["side"],
                "entry": float(r["entry"]),
                "exit": float(r["exit"]),
                "sl": float(r["sl"]),
                "qty": float(r["qty"]),
                "openedAt": r["opened_at"],
                "closedAt": r["closed_at"],
                "pnlUsd": float(r["pnl_usd"]),
                "rMultiple": float(r["r_multiple"]),
                "notes": r["notes"] or "",
            }
            for r in rows
        ]
    finally:
        conn.close()


def delete_journal_trade(trade_id: int, db_path: Optional[str] = None) -> bool:
    conn = get_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM journal WHERE id = ?", (trade_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def get_journal_stats(db_path: Optional[str] = None) -> Dict[str, Any]:
    import datetime
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    start_of_day = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    start_ms = int(start_of_day.timestamp() * 1000)

    conn = get_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT pnl_usd, r_multiple, closed_at FROM journal")
        rows = cursor.fetchall()

        settings = get_settings(db_path)
        balance = float(settings.get("balance", "10000.0"))
        daily_limit_pct = float(settings.get("daily_limit_pct", "3.0"))

        trades_count = len(rows)
        if trades_count == 0:
            return {
                "trades": 0,
                "winRate": 0.0,
                "totalR": 0.0,
                "expectancy": 0.0,
                "todayPnlUsd": 0.0,
                "dailyLimitHit": False,
            }

        wins = [r for r in rows if r["pnl_usd"] > 0]
        win_rate = round((len(wins) / trades_count) * 100.0, 1)
        total_r = round(sum(r["r_multiple"] for r in rows), 2)
        expectancy = round(total_r / trades_count, 2)

        today_rows = [r for r in rows if r["closed_at"] and r["closed_at"] >= start_ms]
        today_pnl = round(sum(r["pnl_usd"] for r in today_rows), 2)

        max_daily_loss = balance * (daily_limit_pct / 100.0)
        daily_limit_hit = today_pnl < 0 and abs(today_pnl) >= max_daily_loss

        return {
            "trades": trades_count,
            "winRate": win_rate,
            "totalR": total_r,
            "expectancy": expectancy,
            "todayPnlUsd": today_pnl,
            "dailyLimitHit": daily_limit_hit,
        }
    finally:
        conn.close()


def check_daily_limit_hit(balance: float, daily_limit_pct: float, db_path: Optional[str] = None) -> bool:
    stats = get_journal_stats(db_path=db_path)
    return stats.get("dailyLimitHit", False)



