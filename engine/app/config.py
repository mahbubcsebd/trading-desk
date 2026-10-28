import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env if present in root or engine
root_env = Path(__file__).resolve().parent.parent.parent / ".env"
engine_env = Path(__file__).resolve().parent.parent / ".env"
if root_env.exists():
    load_dotenv(dotenv_path=root_env)
elif engine_env.exists():
    load_dotenv(dotenv_path=engine_env)

# ---------------------------------------------------------------------------
# Broker: Exness  |  Instrument: XAU/USD (Gold vs USD)
# Symbol naming follows Exness / MT5 convention: "XAUUSD"
# Data source: Yahoo Finance (ticker "GC=F" for Gold Futures, close matches
#              Exness & TradingView spot XAU/USD within a few cents)
# ---------------------------------------------------------------------------
SYMBOLS = ["XAUUSD"]          # Primary: Gold  |  add "BTCUSD" later if needed
ENTRY_TF = "15m"
BIAS_TFS = ["1h", "4h"]
CHART_TFS = ["1m", "5m", "15m", "30m", "1h", "4h", "1D"]
HISTORY_BARS = {
    "1m":  500,
    "5m":  500,
    "15m": 1000,
    "30m": 1000,
    "1h":  1000,
    "4h":  1000,
    "1D":  500,
}
BACKFILL_BARS = {"15m": 30000}

# ---------------------------------------------------------------------------
# Exness XAU/USD trading costs
#   - Exness Raw Spread account: spread ≈ 0.1–0.3 pip on gold (already in
#     market price), commission ≈ $3.5/lot each way → ~0.035% for a
#     standard 100-oz lot at ~$2700/oz.
#   - We model this as a symmetric taker cost of 0.00035 per side.
#   - Slippage on gold at Exness during normal hours is < 1 pip (0.10 USD).
# ---------------------------------------------------------------------------
TAKER_FEE  = 0.00035   # ~$3.5/lot commission as fraction of notional
SLIPPAGE   = 0.00005   # ~0.05 USD on a ~2700 gold price ≈ <0.002%

SCORE_MIN          = 60
RR_MIN             = 1.5
SIGNAL_EXPIRY_BARS = 32
WEIGHTS = {"align": 0.30, "edge": 0.25, "flow": 0.25, "regime": 0.10, "rr": 0.10}
ADX_TREND = 22

# ---------------------------------------------------------------------------
# System settings
# ---------------------------------------------------------------------------
ENGINE_KEY = os.getenv("ENGINE_KEY", "change-me-long-random")
DB_PATH    = os.getenv("DB_PATH", "tradedesk.db")
APP_TZ     = os.getenv("APP_TZ", "UTC")

# ---------------------------------------------------------------------------
# Yahoo Finance ticker mapping  (used by exness.py data client)
#   Yahoo ticker  →  Exness display symbol
#   "GC=F"        →  XAUUSD   (Gold Futures — price tracks spot XAU/USD)
#   "BTC-USD"     →  BTCUSD
# ---------------------------------------------------------------------------
SYMBOL_TO_YF = {
    "XAUUSD": "GC=F",
    "BTCUSD": "BTC-USD",
}

# Yahoo Finance interval / period mapping that matches our timeframes
YF_INTERVAL_MAP = {
    "1m":  "1m",
    "5m":  "5m",
    "15m": "15m",
    "30m": "30m",
    "1h":  "1h",
    "4h":  "1h",    # yfinance has no 4h; we'll resample from 1h
    "1D":  "1d",
}

# How many calendar days of history to request per timeframe
YF_PERIOD_MAP = {
    "1m":  "5d",
    "5m":  "30d",
    "15m": "60d",
    "30m": "60d",
    "1h":  "60d",
    "4h":  "60d",
    "1D":  "2y",
}

# Exness XAU/USD instrument rules (MT5 contract spec)
#   1 lot  = 100 troy oz
#   Min lot: 0.01  |  Lot step: 0.01  |  Tick size: 0.01 USD
EXNESS_INSTRUMENT_RULES = {
    "XAUUSD": {
        "tick_size":     0.01,
        "qty_step":      0.01,
        "min_order_qty": 0.01,
    },
    "BTCUSD": {
        "tick_size":     0.01,
        "qty_step":      0.001,
        "min_order_qty": 0.001,
    },
}
