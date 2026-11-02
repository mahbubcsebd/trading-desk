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
SYMBOLS = ["XAUUSD", "BTCUSD", "EURUSD", "GBPUSD", "USDJPY", "US30", "NAS100"]
ENTRY_TF = "15m"
BIAS_TFS = ["1h", "4h"]
CHART_TFS = ["1m", "5m", "15m", "30m", "1h", "4h", "1D"]
HISTORY_BARS = {
    "1m":  300,
    "5m":  500,
    "15m": 800,
    "30m": 500,
    "1h":  800,
    "4h":  600,
    "1D":  300,
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

SCORE_MIN          = 55        # Optimized for Exness XAU/USD live breakouts
RR_MIN             = 1.5       # Minimum 1:1.5 Risk-to-Reward
SIGNAL_EXPIRY_BARS = 32

# Multi-timeframe price-action weights for Exness Forex / Spot Gold:
# 40% Trend alignment (4h + 1h), 30% Strategy breakout edge, 15% Regime/ADX, 15% R:R
WEIGHTS = {"align": 0.40, "edge": 0.30, "regime": 0.15, "rr": 0.15}
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
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "USDJPY=X",
    "US30":   "YM=F",
    "NAS100": "NQ=F",
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

# Exness instrument rules (MT5 contract specifications)
#   XAUUSD: 1 lot = 100 troy oz ($1 move = $100/lot)
#   BTCUSD: 1 lot = 1 coin ($1 move = $1/lot)
#   EURUSD: 1 lot = 100,000 EUR (1 pip 0.0001 = $10/lot)
#   GBPUSD: 1 lot = 100,000 GBP (1 pip 0.0001 = $10/lot)
#   USDJPY: 1 lot = 100,000 USD (1 pip 0.01 = ~1000 JPY / price in USD)
#   US30:   1 lot = 1 index point ($1 per point)
#   NAS100: 1 lot = 1 index point ($1 per point)
EXNESS_INSTRUMENT_RULES = {
    "XAUUSD": {
        "tick_size":     0.01,
        "qty_step":      0.01,
        "min_order_qty": 0.01,
        "contract_size": 100.0,
        "decimals":      2,
    },
    "BTCUSD": {
        "tick_size":     0.01,
        "qty_step":      0.001,
        "min_order_qty": 0.001,
        "contract_size": 1.0,
        "decimals":      2,
    },
    "EURUSD": {
        "tick_size":     0.00001,
        "qty_step":      0.01,
        "min_order_qty": 0.01,
        "contract_size": 100000.0,
        "decimals":      5,
    },
    "GBPUSD": {
        "tick_size":     0.00001,
        "qty_step":      0.01,
        "min_order_qty": 0.01,
        "contract_size": 100000.0,
        "decimals":      5,
    },
    "USDJPY": {
        "tick_size":     0.001,
        "qty_step":      0.01,
        "min_order_qty": 0.01,
        "contract_size": 100000.0,
        "decimals":      3,
    },
    "US30": {
        "tick_size":     0.1,
        "qty_step":      0.01,
        "min_order_qty": 0.01,
        "contract_size": 1.0,
        "decimals":      2,
    },
    "NAS100": {
        "tick_size":     0.1,
        "qty_step":      0.01,
        "min_order_qty": 0.01,
        "contract_size": 1.0,
        "decimals":      2,
    },
}
