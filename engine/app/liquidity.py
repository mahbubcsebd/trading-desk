import time
from collections import deque
from typing import Any, Dict, List, Optional, Tuple


class OrderBook:
    def __init__(self):
        self.bids: Dict[float, float] = {}  # price -> size
        self.asks: Dict[float, float] = {}  # price -> size
        self.last_update_ts: float = 0.0

    def apply_snapshot(self, bids: List[List[str]], asks: List[List[str]]) -> None:
        self.bids.clear()
        self.asks.clear()
        for p, s in bids:
            size = float(s)
            if size > 0:
                self.bids[float(p)] = size
        for p, s in asks:
            size = float(s)
            if size > 0:
                self.asks[float(p)] = size
        self.last_update_ts = time.time()

    def apply_delta(self, bids: List[List[str]], asks: List[List[str]]) -> None:
        for p, s in bids:
            price = float(p)
            size = float(s)
            if size <= 0:
                self.bids.pop(price, None)
            else:
                self.bids[price] = size
        for p, s in asks:
            price = float(p)
            size = float(s)
            if size <= 0:
                self.asks.pop(price, None)
            else:
                self.asks[price] = size
        self.last_update_ts = time.time()


class SymbolLiquidityTracker:
    def __init__(self, symbol: str):
        self.symbol = symbol
        self.orderbook = OrderBook()
        self.trades: deque[Tuple[int, str, float]] = deque()  # (ts_ms, side, usd_val)
        self.oi_history: deque[Tuple[int, float]] = deque()  # (ts_ms, oi)
        self.liquidations: deque[Tuple[int, str, float]] = deque()  # (ts_ms, side, usd_val)
        self.current_funding: float = 0.0
        self.current_oi: float = 0.0

        # Cached metrics (throttled to at most once per second)
        self._last_metrics_calc_ts: float = 0.0
        self._cached_metrics: Dict[str, Any] = {
            "bookImbalance": 0.0,
            "buyWall": None,
            "sellWall": None,
            "takerBuyPct": 50.0,
            "oiChange15mPct": 0.0,
            "funding": 0.0,
            "liq5m": {"longUsd": 0.0, "shortUsd": 0.0},
        }

    def add_trade(self, ts_ms: int, side: str, price: float, qty: float) -> None:
        usd_val = price * qty
        self.trades.append((ts_ms, side, usd_val))
        self._prune_trades(ts_ms)

    def _prune_trades(self, now_ms: int) -> None:
        cutoff = now_ms - (5 * 60 * 1000)
        while self.trades and self.trades[0][0] < cutoff:
            self.trades.popleft()

    def update_oi(self, ts_ms: int, oi: float) -> None:
        self.current_oi = oi
        self.oi_history.append((ts_ms, oi))
        # Keep 30 minutes of OI history
        cutoff = ts_ms - (30 * 60 * 1000)
        while self.oi_history and self.oi_history[0][0] < cutoff:
            self.oi_history.popleft()

    def update_funding(self, funding_rate: float) -> None:
        self.current_funding = funding_rate

    def add_liquidation(self, ts_ms: int, side: str, price: float, qty: float) -> None:
        usd_val = price * qty
        self.liquidations.append((ts_ms, side, usd_val))
        self._prune_liquidations(ts_ms)

    def _prune_liquidations(self, now_ms: int) -> None:
        cutoff = now_ms - (5 * 60 * 1000)
        while self.liquidations and self.liquidations[0][0] < cutoff:
            self.liquidations.popleft()

    def get_metrics(self, current_price: float) -> Dict[str, Any]:
        now = time.time()
        # Throttle recalculation to at most once per second
        if (now - self._last_metrics_calc_ts) < 1.0 and self._last_metrics_calc_ts > 0:
            return self._cached_metrics

        now_ms = int(now * 1000)
        self._prune_trades(now_ms)
        self._prune_liquidations(now_ms)

        # 1. Book Imbalance within ±0.25% of current_price
        book_imbalance = 0.0
        buy_wall = None
        sell_wall = None

        if current_price > 0 and (self.orderbook.bids or self.orderbook.asks):
            p_low_025 = current_price * (1.0 - 0.0025)
            p_high_025 = current_price * (1.0 + 0.0025)

            bid_usd_025 = sum(p * s for p, s in self.orderbook.bids.items() if p_low_025 <= p <= current_price)
            ask_usd_025 = sum(p * s for p, s in self.orderbook.asks.items() if current_price <= p <= p_high_025)

            total_depth_025 = bid_usd_025 + ask_usd_025
            if total_depth_025 > 0:
                book_imbalance = round((bid_usd_025 - ask_usd_025) / total_depth_025, 4)

            # 2. Buy Wall & Sell Wall within ±0.5% of price
            p_low_050 = current_price * (1.0 - 0.005)
            p_high_050 = current_price * (1.0 + 0.005)

            # Largest bid within -0.5%
            max_bid_usd = 0.0
            max_bid_price = 0.0
            for p, s in self.orderbook.bids.items():
                if p_low_050 <= p <= current_price:
                    usd = p * s
                    if usd > max_bid_usd:
                        max_bid_usd = usd
                        max_bid_price = p

            if max_bid_usd > 0:
                buy_wall = {"price": round(max_bid_price, 2), "usd": round(max_bid_usd, 0)}

            # Largest ask within +0.5%
            max_ask_usd = 0.0
            max_ask_price = 0.0
            for p, s in self.orderbook.asks.items():
                if current_price <= p <= p_high_050:
                    usd = p * s
                    if usd > max_ask_usd:
                        max_ask_usd = usd
                        max_ask_price = p

            if max_ask_usd > 0:
                sell_wall = {"price": round(max_ask_price, 2), "usd": round(max_ask_usd, 0)}

        # 3. Taker Buy Pct over last 5 minutes
        taker_buy_pct = 50.0
        if self.trades:
            buy_usd = sum(usd for _, side, usd in self.trades if side.lower() == "buy")
            total_trade_usd = sum(usd for _, _, usd in self.trades)
            if total_trade_usd > 0:
                taker_buy_pct = round((buy_usd / total_trade_usd) * 100.0, 1)

        # 4. OI Change 15m Pct
        oi_change_15m_pct = 0.0
        if len(self.oi_history) >= 2 and self.current_oi > 0:
            target_ts = now_ms - (15 * 60 * 1000)
            # Find closest past OI entry
            past_entry = min(self.oi_history, key=lambda x: abs(x[0] - target_ts))
            past_oi = past_entry[1]
            if past_oi > 0:
                oi_change_15m_pct = round((self.current_oi - past_oi) / past_oi, 4)

        # 5. Liquidations in last 5m
        long_liq_usd = 0.0
        short_liq_usd = 0.0
        for _, side, usd in self.liquidations:
            # On Bybit linear, a liquidated long sells; a liquidated short buys
            if side.lower() == "sell":
                long_liq_usd += usd
            elif side.lower() == "buy":
                short_liq_usd += usd

        self._cached_metrics = {
            "bookImbalance": book_imbalance,
            "buyWall": buy_wall,
            "sellWall": sell_wall,
            "takerBuyPct": taker_buy_pct,
            "oiChange15mPct": oi_change_15m_pct,
            "funding": round(self.current_funding, 6),
            "liq5m": {
                "longUsd": round(long_liq_usd, 0),
                "shortUsd": round(short_liq_usd, 0),
            },
        }
        self._last_metrics_calc_ts = now
        return self._cached_metrics
