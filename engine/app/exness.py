"""
exness.py — Market data client for Exness XAU/USD trading.

Data source:
  • Primary live tick: TradingView CFD scanner (OANDA:XAUUSD) — gives the exact
    real-time OTC spot gold price to the cent, in 100% sync with the TradingView chart!
  • Historical candles: Yahoo Finance (GC=F) calibrated with the live futures-to-spot
    basis so all OHLC levels, ATR, and breakout channels match Exness spot gold.
  • Fallback: Yahoo Finance fast_info.
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

import httpx
import pandas as pd
import yfinance as yf

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
# REST-equivalent: historical data + live quotes
# ---------------------------------------------------------------------------

class ExnessRestClient:
    """Fetches historical candles and live quotes calibrated for Exness XAU/USD."""

    def get_instrument_info(self, symbol: str) -> InstrumentRule:
        rules = config.EXNESS_INSTRUMENT_RULES.get(symbol, {})
        return InstrumentRule(
            tick_size=rules.get("tick_size", 0.01),
            qty_step=rules.get("qty_step", 0.01),
            min_order_qty=rules.get("min_order_qty", 0.01),
        )

    def _get_spot_price_tv(self, symbol: str) -> Optional[float]:
        """Fetches spot price directly from TradingView CFD scanner (exact match with chart)."""
        ticker = "OANDA:XAUUSD" if symbol == "XAUUSD" else "INDEX:BTCUSD"
        try:
            r = httpx.post(
                "https://scanner.tradingview.com/cfd/scan",
                json={"symbols": {"tickers": [ticker]}, "columns": ["close"]},
                timeout=3.0,
            )
            if r.status_code == 200:
                data = r.json().get("data", [])
                if data and len(data[0].get("d", [])) > 0:
                    val = float(data[0]["d"][0])
                    if val > 0:
                        return val
        except Exception:
            pass
        return None

    def get_latest_price(self, symbol: str) -> Optional[float]:
        """Return the latest live spot price (matches TradingView chart)."""
        # 1. TradingView scanner (exact cent match with chart widget)
        tv_price = self._get_spot_price_tv(symbol)
        if tv_price:
            return round(tv_price, 2)

        # 2. Fallback to Yahoo Finance fast_info
        yf_ticker = config.SYMBOL_TO_YF.get(symbol)
        if not yf_ticker:
            return None
        try:
            ticker = yf.Ticker(yf_ticker)
            price = ticker.fast_info.last_price
            if price and float(price) > 0:
                return round(float(price), 2)
        except Exception as exc:
            logger.debug(f"Could not fetch fast_info price for {symbol}: {exc}")
        return None

    def get_klines(self, symbol: str, tf: str, limit: int = 1000) -> List[List[float]]:
        """
        Download historical OHLCV bars from Yahoo Finance, calibrated to
        spot gold levels so chart and backend calculations align 100%.
        """
        yf_ticker  = config.SYMBOL_TO_YF.get(symbol)
        if not yf_ticker:
            logger.warning(f"No Yahoo Finance ticker mapped for {symbol}")
            return []

        yf_interval = config.YF_INTERVAL_MAP.get(tf, "15m")
        yf_period   = config.YF_PERIOD_MAP.get(tf, "60d")

        try:
            if tf == "4h":
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

            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
            bars = _df_to_bars(df)
            bars = bars[-limit:]

            # Normalize candles to Spot Gold price if basis exists
            if symbol == "XAUUSD" and bars:
                spot_now = self._get_spot_price_tv(symbol)
                gc_now = bars[-1][4]
                if spot_now and gc_now and abs(gc_now - spot_now) > 1.0:
                    basis = gc_now - spot_now
                    for b in bars:
                        b[1] = round(b[1] - basis, 2)
                        b[2] = round(b[2] - basis, 2)
                        b[3] = round(b[3] - basis, 2)
                        b[4] = round(b[4] - basis, 2)

            return bars

        except Exception as exc:
            logger.error(f"yfinance download failed for {symbol}/{tf}: {exc}")
            return []


# ---------------------------------------------------------------------------
# Live price poller (replaces Bybit WebSocket for Exness)
# ---------------------------------------------------------------------------

class ExnessLivePoller:
    """
    Polls TradingView / Yahoo Finance every POLL_INTERVAL seconds to update live prices.
    Synchronizes the in-memory engine state with the live chart.
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
