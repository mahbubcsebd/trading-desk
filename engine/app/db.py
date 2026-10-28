import sqlite3
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


def check_daily_limit_hit(balance: float, daily_limit_pct: float, db_path: Optional[str] = None) -> bool:
    """
    Checks if today's realized loss in journal exceeds balance * daily_limit_pct / 100.
    """
    import datetime
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    start_of_day = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    start_ms = int(start_of_day.timestamp() * 1000)

    conn = get_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT SUM(pnl_usd) as total_pnl FROM journal WHERE closed_at >= ?",
            (start_ms,),
        )
        row = cursor.fetchone()
        if row and row["total_pnl"] is not None:
            total_pnl = float(row["total_pnl"])
            max_loss = balance * (daily_limit_pct / 100.0)
            if total_pnl < 0 and abs(total_pnl) >= max_loss:
                return True
        return False
    finally:
        conn.close()

