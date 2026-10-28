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

SYMBOLS = ["XAUUSDT", "BTCUSDT"]
ENTRY_TF = "15m"
BIAS_TFS = ["1h", "4h"]
CHART_TFS = ["15m", "1h", "4h"]
HISTORY_BARS = {"15m": 1000, "1h": 1000, "4h": 1000}
BACKFILL_BARS = {"15m": 30000}
TAKER_FEE = 0.00055
SLIPPAGE = 0.0002
SCORE_MIN = 60
RR_MIN = 1.5
SIGNAL_EXPIRY_BARS = 32
WEIGHTS = {"align": 0.30, "edge": 0.25, "flow": 0.25, "regime": 0.10, "rr": 0.10}
ADX_TREND = 22

# System settings
ENGINE_KEY = os.getenv("ENGINE_KEY", "change-me-long-random")
DB_PATH = os.getenv("DB_PATH", "tradedesk.db")
APP_TZ = os.getenv("APP_TZ", "UTC")

# Bybit endpoints
BYBIT_REST_BASE = "https://api.bybit.com"
BYBIT_WS_URL = "wss://stream.bybit.com/v5/public/linear"

# Interval mappings
TF_TO_BYBIT_INTERVAL = {
    "15m": "15",
    "1h": "60",
    "4h": "240",
}
BYBIT_INTERVAL_TO_TF = {v: k for k, v in TF_TO_BYBIT_INTERVAL.items()}
