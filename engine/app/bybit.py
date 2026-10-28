import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional
import httpx
import websockets
from app import config, db
from app.state import InstrumentRule, state

logger = logging.getLogger("bybit")


class BybitRestClient:
    def __init__(self, base_url: str = config.BYBIT_REST_BASE):
        self.base_url = base_url

    async def get_instrument_info(self, symbol: str) -> InstrumentRule:
        url = f"{self.base_url}/v5/market/instruments-info?category=linear&symbol={symbol}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("result", {}).get("list", [])
            if not items:
                logger.warning(f"No instrument info found for {symbol}, using defaults")
                return InstrumentRule()
            info = items[0]
            tick_size = float(info.get("priceFilter", {}).get("tickSize", 0.01))
            qty_step = float(info.get("lotSizeFilter", {}).get("qtyStep", 0.001))
            min_order_qty = float(info.get("lotSizeFilter", {}).get("minOrderQty", 0.001))
            return InstrumentRule(
                tick_size=tick_size,
                qty_step=qty_step,
                min_order_qty=min_order_qty,
            )

    async def get_klines(self, symbol: str, interval: str, limit: int = 1000) -> List[List[float]]:
        url = f"{self.base_url}/v5/market/kline?category=linear&symbol={symbol}&interval={interval}&limit={limit}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            rows = data.get("result", {}).get("list", [])
            # Bybit returns newest first: [startTime, open, high, low, close, volume, turnover]
            # Convert and reverse to oldest first: [[ts, o, h, l, c, v], ...]
            formatted = []
            for r in reversed(rows):
                formatted.append([
                    int(r[0]),
                    float(r[1]),
                    float(r[2]),
                    float(r[3]),
                    float(r[4]),
                    float(r[5]),
                ])
            return formatted

    async def get_tickers(self, symbol: str) -> Dict[str, Any]:
        url = f"{self.base_url}/v5/market/tickers?category=linear&symbol={symbol}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("result", {}).get("list", [])
            if items:
                return items[0]
            return {}


class BybitWsClient:
    def __init__(self, ws_url: str = config.BYBIT_WS_URL):
        self.ws_url = ws_url
        self._running = False
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._task: Optional[asyncio.Task] = None

    def _get_subscription_topics(self) -> List[str]:
        topics = []
        for symbol in config.SYMBOLS:
            topics.append(f"tickers.{symbol}")
            topics.append(f"orderbook.50.{symbol}")
            topics.append(f"publicTrade.{symbol}")
            topics.append(f"allLiquidation.{symbol}")
            for tf in config.CHART_TFS:
                interval = config.TF_TO_BYBIT_INTERVAL[tf]
                topics.append(f"kline.{interval}.{symbol}")
        return topics


    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        self._running = False
        if self._ws:
            await self._ws.close()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run_loop(self) -> None:
        backoff = 1.0
        while self._running:
            try:
                logger.info(f"Connecting to Bybit WebSocket at {self.ws_url}...")
                async with websockets.connect(
                    self.ws_url,
                    ping_interval=None,  # We manage manual Bybit pings
                    close_timeout=5,
                ) as ws:
                    self._ws = ws
                    backoff = 1.0
                    logger.info("Bybit WebSocket connected successfully.")

                    # Subscribe to topics
                    topics = self._get_subscription_topics()
                    sub_payload = {"op": "subscribe", "args": topics}
                    await ws.send(json.dumps(sub_payload))
                    logger.info(f"Subscribed to {len(topics)} Bybit topics.")

                    # Start ping and receive coroutines
                    ping_task = asyncio.create_task(self._ping_loop(ws))
                    try:
                        await self._receive_loop(ws)
                    finally:
                        ping_task.cancel()

            except (websockets.ConnectionClosed, asyncio.CancelledError, Exception) as exc:
                if not self._running:
                    break
                logger.warning(f"Bybit WebSocket error: {exc}. Reconnecting in {backoff:.1f}s...")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2.0, 30.0)

    async def _ping_loop(self, ws: websockets.WebSocketClientProtocol) -> None:
        while self._running:
            try:
                await asyncio.sleep(20.0)
                await ws.send(json.dumps({"op": "ping"}))
            except Exception:
                break

    async def _receive_loop(self, ws: websockets.WebSocketClientProtocol) -> None:
        async for raw_msg in ws:
            try:
                msg = json.loads(raw_msg)
                # Heartbeat reply or subscription confirmation
                if msg.get("op") == "pong" or msg.get("op") == "subscribe":
                    continue

                topic = msg.get("topic", "")
                if topic.startswith("kline."):
                    self._handle_kline(topic, msg.get("data", []))
                elif topic.startswith("tickers."):
                    self._handle_ticker(topic, msg.get("data", {}))
                elif topic.startswith("orderbook."):
                    self._handle_orderbook(topic, msg.get("type", ""), msg.get("data", {}))
                elif topic.startswith("publicTrade."):
                    self._handle_public_trade(topic, msg.get("data", []))
                elif topic.startswith("allLiquidation."):
                    self._handle_liquidation(topic, msg.get("data", []))
            except Exception as e:
                logger.error(f"Error handling Bybit WS message: {e}", exc_info=True)

    def _handle_kline(self, topic: str, data: List[Dict[str, Any]]) -> None:
        # Topic format: kline.<interval>.<symbol> e.g. kline.15.BTCUSDT
        parts = topic.split(".")
        if len(parts) != 3:
            return
        interval, symbol = parts[1], parts[2]
        tf = config.BYBIT_INTERVAL_TO_TF.get(interval)
        if not tf:
            return

        sym_state = state.get_symbol(symbol)
        if not sym_state:
            return

        for item in data:
            start = int(item["start"])
            o = float(item["open"])
            h = float(item["high"])
            l = float(item["low"])
            c = float(item["close"])
            v = float(item["volume"])
            confirm = bool(item.get("confirm", False))

            confirmed_bar = sym_state.update_candle(tf, start, o, h, l, c, v, confirm)
            if confirmed_bar:
                # Save finalized closed candle to SQLite
                db.save_candles([confirmed_bar])

    def _handle_ticker(self, topic: str, data: Dict[str, Any]) -> None:
        # Topic format: tickers.<symbol>
        parts = topic.split(".")
        if len(parts) != 2:
            return
        symbol = parts[1]
        sym_state = state.get_symbol(symbol)
        if not sym_state:
            return

        sym_state.last_msg_ts = time.time()
        if "lastPrice" in data and data["lastPrice"]:
            try:
                sym_state.update_live_price(float(data["lastPrice"]))
            except (ValueError, TypeError):
                pass
        if "price24hPcnt" in data and data["price24hPcnt"]:
            try:
                sym_state.change_24h_pct = float(data["price24hPcnt"]) * 100.0
            except (ValueError, TypeError):
                pass
        if "fundingRate" in data and data["fundingRate"] is not None and sym_state.liquidity_tracker:
            try:
                sym_state.liquidity_tracker.update_funding(float(data["fundingRate"]))
            except (ValueError, TypeError):
                pass
        if "openInterest" in data and data["openInterest"] is not None and sym_state.liquidity_tracker:
            try:
                sym_state.liquidity_tracker.update_oi(int(time.time() * 1000), float(data["openInterest"]))
            except (ValueError, TypeError):
                pass

    def _handle_orderbook(self, topic: str, msg_type: str, data: Dict[str, Any]) -> None:
        # Topic format: orderbook.50.<symbol>
        parts = topic.split(".")
        if len(parts) != 3:
            return
        symbol = parts[2]
        sym_state = state.get_symbol(symbol)
        if not sym_state or not sym_state.liquidity_tracker:
            return

        sym_state.last_msg_ts = time.time()
        bids = data.get("b", [])
        asks = data.get("a", [])

        if msg_type == "snapshot":
            sym_state.liquidity_tracker.orderbook.apply_snapshot(bids, asks)
        elif msg_type == "delta":
            sym_state.liquidity_tracker.orderbook.apply_delta(bids, asks)

    def _handle_public_trade(self, topic: str, data: List[Dict[str, Any]]) -> None:
        # Topic format: publicTrade.<symbol>
        parts = topic.split(".")
        if len(parts) != 2:
            return
        symbol = parts[1]
        sym_state = state.get_symbol(symbol)
        if not sym_state or not sym_state.liquidity_tracker:
            return

        sym_state.last_msg_ts = time.time()
        for item in data:
            try:
                ts = int(item.get("T", time.time() * 1000))
                side = item.get("S", "Buy")
                p = float(item.get("p", 0.0))
                v = float(item.get("v", 0.0))
                if p > 0:
                    sym_state.update_live_price(p)
                sym_state.liquidity_tracker.add_trade(ts, side, p, v)
            except (ValueError, TypeError):
                continue

    def _handle_liquidation(self, topic: str, data: Any) -> None:
        # Topic format: allLiquidation.<symbol>
        parts = topic.split(".")
        if len(parts) != 2:
            return
        symbol = parts[1]
        sym_state = state.get_symbol(symbol)
        if not sym_state or not sym_state.liquidity_tracker:
            return

        sym_state.last_msg_ts = time.time()
        items = data if isinstance(data, list) else [data]
        for item in items:
            try:
                ts = int(item.get("updatedTime", time.time() * 1000))
                side = item.get("side", "")
                p = float(item.get("price", 0.0))
                v = float(item.get("size", 0.0))
                sym_state.liquidity_tracker.add_liquidation(ts, side, p, v)
            except (ValueError, TypeError):
                continue

