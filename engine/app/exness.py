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
  We poll Yahoo Finance fast_info every 3 s for the latest price and update
  the in-memory state.  On weekends / market close the price is held at last.

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
                # Download 1h, flatten columns, then resample to 4h
                df_1h = yf.download(
                    yf_ticker, interval="1h", period=yf_period,
                    auto_adjust=True, progress=False
                )
                if df_1h.empty:
                    return []
                if isinstance(df_1h.columns, pd.MultiIndex):
                    df_1h.columns = df_1h.columns.get_level_values(0)
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
        """Return the latest available price using fast_info (sub-second)."""
        yf_ticker = config.SYMBOL_TO_YF.get(symbol)
        if not yf_ticker:
            return None
        try:
            ticker = yf.Ticker(yf_ticker)
            price = ticker.fast_info.last_price
            if price and float(price) > 0:
                return float(price)
        except Exception as exc:
            logger.debug(f"Could not fetch fast_info price for {symbol}: {exc}")
        return None


# ---------------------------------------------------------------------------
# Live price poller (replaces Bybit WebSocket for Exness)
# ---------------------------------------------------------------------------

class ExnessLivePoller:
    """
    Polls Yahoo Finance every POLL_INTERVAL seconds to update live prices.
    Uses fast_info for sub-second live price updates without heavy downloads.
    """

    POLL_INTERVAL = 3.0   # seconds between price polls

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
        candle_refresh_counter = 0
        while self._running:
            try:
                await self._poll_all_symbols()
                candle_refresh_counter += 1
                # Periodically sync latest 1m candle every ~30 seconds (10 cycles)
                if candle_refresh_counter >= 10:
                    candle_refresh_counter = 0
                    await self._refresh_latest_candle("1m")
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
                price = await loop.run_in_executor(
                    None, self._rest.get_latest_price, symbol
                )
                if price and price > 0:
                    sym_state.update_live_price(price)
            except Exception as exc:
                logger.warning(f"Failed to update live price for {symbol}: {exc}")

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
                    lambda s=symbol, t=tf: self._rest.get_klines(s, t, limit=2)
                )
                if not bars:
                    continue
                for bar in bars:
                    ts, o, h, l, c, v = bar
                    sym_state.update_candle(tf, int(ts), o, h, l, c, v, confirm=False)
            except Exception as exc:
                logger.debug(f"Failed to refresh {tf} candle for {symbol}: {exc}")
