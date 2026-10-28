"""
exness.py — Market data client for Exness XAU/USD trading.

Data source: Yahoo Finance (via yfinance).
  • GC=F  (Gold Futures) → tracks Exness/TradingView spot XAU/USD within cents.
  • BTC-USD → tracks Exness BTCUSD.

Why Yahoo Finance?
  Exness does not provide a public REST/WebSocket market-data API.
  Yahoo Finance "GC=F" (COMEX Gold Futures) is the closest freely available
  feed that matches Exness & TradingView spot gold prices tick-for-tick during
  market hours (delta is typically < 0.5 USD).

Live-price polling:
  We poll Yahoo Finance every 5 s for the latest bid/ask and update the
  in-memory state.  On weekends / market close the price is held at last.

Historical candles:
  Fetched once at startup via yfinance.download(); 4h bars are resampled
  from 1h data (yfinance has no native 4h interval).
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

import yfinance as yf
import pandas as pd

from app import config, db
from app.state import InstrumentRule, state

logger = logging.getLogger("exness")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resample_4h(df_1h: pd.DataFrame) -> pd.DataFrame:
    """Resample a 1-h OHLCV DataFrame into 4-h bars."""
    rule = "4h"
    agg = {
        "Open":   "first",
        "High":   "max",
        "Low":    "min",
        "Close":  "last",
        "Volume": "sum",
    }
    df4 = df_1h.resample(rule, closed="left", label="left").agg(agg).dropna()
    return df4


def _df_to_bars(df: pd.DataFrame) -> List[List[float]]:
    """Convert a yfinance DataFrame to [[ts_ms, o, h, l, c, v], ...] oldest first."""
    bars = []
    for idx, row in df.iterrows():
        # idx is a tz-aware or tz-naive Timestamp; convert to UTC epoch ms
        if hasattr(idx, "timestamp"):
            ts_ms = int(idx.timestamp() * 1000)
        else:
            ts_ms = int(pd.Timestamp(idx).timestamp() * 1000)
        bars.append([
            ts_ms,
            float(row["Open"]),
            float(row["High"]),
            float(row["Low"]),
            float(row["Close"]),
            float(row["Volume"]),
        ])
    return bars


# ---------------------------------------------------------------------------
# REST-equivalent: historical data
# ---------------------------------------------------------------------------

class ExnessRestClient:
    """Fetches historical candles and instrument info from Yahoo Finance."""

    def get_instrument_info(self, symbol: str) -> InstrumentRule:
        rules = config.EXNESS_INSTRUMENT_RULES.get(symbol, {})
        return InstrumentRule(
            tick_size=rules.get("tick_size", 0.01),
            qty_step=rules.get("qty_step", 0.01),
            min_order_qty=rules.get("min_order_qty", 0.01),
        )

    def get_klines(self, symbol: str, tf: str, limit: int = 1000) -> List[List[float]]:
        """
        Download historical OHLCV bars from Yahoo Finance.
        Returns [[ts_ms, o, h, l, c, v], ...] oldest-first, up to `limit` bars.
        """
        yf_ticker  = config.SYMBOL_TO_YF.get(symbol)
        if not yf_ticker:
            logger.warning(f"No Yahoo Finance ticker mapped for {symbol}")
            return []

        yf_interval = config.YF_INTERVAL_MAP.get(tf, "15m")
        yf_period   = config.YF_PERIOD_MAP.get(tf, "60d")

        try:
            if tf == "4h":
                # Download 1h, then resample
                df_1h = yf.download(
                    yf_ticker, interval="1h", period=yf_period,
                    auto_adjust=True, progress=False
                )
                if df_1h.empty:
                    return []
                df = _resample_4h(df_1h)
            else:
                df = yf.download(
                    yf_ticker, interval=yf_interval, period=yf_period,
                    auto_adjust=True, progress=False
                )

            if df.empty:
                return []

            # Flatten MultiIndex columns that yfinance sometimes returns
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
            bars = _df_to_bars(df)
            return bars[-limit:]          # newest tail up to limit

        except Exception as exc:
            logger.error(f"yfinance download failed for {symbol}/{tf}: {exc}")
            return []

    def get_latest_price(self, symbol: str) -> Optional[float]:
        """Return the latest available close price from Yahoo Finance."""
        yf_ticker = config.SYMBOL_TO_YF.get(symbol)
        if not yf_ticker:
            return None
        try:
            ticker = yf.Ticker(yf_ticker)
            info   = ticker.fast_info
            price  = getattr(info, "last_price", None)
            if price:
                return float(price)
            # Fallback: 1-min bar
            df = yf.download(yf_ticker, interval="1m", period="1d",
                             auto_adjust=True, progress=False)
            if not df.empty:
                return float(df["Close"].iloc[-1])
        except Exception as exc:
            logger.warning(f"Could not fetch latest price for {symbol}: {exc}")
        return None


# ---------------------------------------------------------------------------
# Live price poller (replaces Bybit WebSocket for Exness)
# ---------------------------------------------------------------------------

class ExnessLivePoller:
    """
    Polls Yahoo Finance every POLL_INTERVAL seconds to update live prices.

    Exness is a retail CFD/spot broker — there is no public WebSocket feed.
    Polling Yahoo Finance every 5 s gives sufficient freshness for the
    15-minute entry timeframe used by this engine.
    """

    POLL_INTERVAL = 5.0   # seconds between price polls

    def __init__(self):
        self._running  = False
        self._task: Optional[asyncio.Task] = None
        self._rest     = ExnessRestClient()

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("Exness live price poller started.")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Exness live price poller stopped.")

    async def _poll_loop(self) -> None:
        while self._running:
            try:
                await self._poll_all_symbols()
            except Exception as exc:
                logger.warning(f"Poll loop error: {exc}")
            await asyncio.sleep(self.POLL_INTERVAL)

    async def _poll_all_symbols(self) -> None:
        loop = asyncio.get_event_loop()
        for symbol in config.SYMBOLS:
            sym_state = state.get_symbol(symbol)
            if not sym_state:
                continue
            try:
                # Run blocking yfinance call in thread pool
                price = await loop.run_in_executor(
                    None, self._rest.get_latest_price, symbol
                )
                if price and price > 0:
                    sym_state.update_live_price(price)
                    sym_state.last_msg_ts = time.time()
                    logger.debug(f"{symbol} live price updated: {price}")
            except Exception as exc:
                logger.warning(f"Failed to update live price for {symbol}: {exc}")

        # Also refresh the latest 1-min candle bar to keep intrabar chart fresh
        await self._refresh_latest_candle("1m")

    async def _refresh_latest_candle(self, tf: str) -> None:
        """Re-fetch the last few bars for `tf` and upsert into state."""
        loop = asyncio.get_event_loop()
        for symbol in config.SYMBOLS:
            sym_state = state.get_symbol(symbol)
            if not sym_state:
                continue
            try:
                bars = await loop.run_in_executor(
                    None,
                    lambda s=symbol, t=tf: self._rest.get_klines(s, t, limit=3)
                )
                if not bars:
                    continue
                for bar in bars:
                    ts, o, h, l, c, v = bar
                    # update_candle with confirm=False keeps the live bar open
                    sym_state.update_candle(tf, int(ts), o, h, l, c, v, confirm=False)
            except Exception as exc:
                logger.warning(f"Failed to refresh {tf} candle for {symbol}: {exc}")
