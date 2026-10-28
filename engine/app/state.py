import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
import pandas as pd
from app import config


@dataclass
class InstrumentRule:
    tick_size: float = 0.01
    qty_step: float = 0.001
    min_order_qty: float = 0.001


@dataclass
class SymbolState:
    symbol: str
    instrument: InstrumentRule = field(default_factory=InstrumentRule)
    # Candles dictionary mapping tf -> list of [ts, o, h, l, c, v] oldest first
    candles: Dict[str, List[List[float]]] = field(default_factory=lambda: {tf: [] for tf in config.CHART_TFS})
    price: float = 0.0
    change_24h_pct: float = 0.0
    last_msg_ts: float = 0.0
    regime: Dict[str, Any] = field(default_factory=lambda: {"state": "ranging", "volatility": "normal", "adx": 0.0})
    bias: Dict[str, str] = field(default_factory=lambda: {"h4": "neutral", "h1": "neutral"})

    @property
    def is_fresh(self) -> bool:
        if self.last_msg_ts <= 0:
            return False
        return (time.time() - self.last_msg_ts) <= 10.0

    def recompute_context(self) -> None:
        """Recomputes regime and bias based on 1h and 4h dataframes."""
        try:
            from app.regime import calc_market_context
            df_1h = self.get_dataframe("1h")
            df_4h = self.get_dataframe("4h")
            ctx = calc_market_context(df_1h, df_4h)
            self.regime = ctx["regime"]
            self.bias = ctx["bias"]
        except Exception:
            pass

    def set_candles(self, tf: str, candle_list: List[List[float]]) -> None:
        """Set history bars, keeping at most HISTORY_BARS[tf]."""
        max_bars = config.HISTORY_BARS.get(tf, 1000)
        if len(candle_list) > max_bars:
            self.candles[tf] = candle_list[-max_bars:]
        else:
            self.candles[tf] = list(candle_list)
        if self.candles[tf] and tf == config.ENTRY_TF:
            self.price = float(self.candles[tf][-1][4])
        if tf in ("1h", "4h"):
            self.recompute_context()

    def update_candle(
        self, tf: str, start: int, o: float, h: float, l: float, c: float, v: float, confirm: bool
    ) -> Optional[Tuple[str, str, int, float, float, float, float, float]]:
        """
        Updates live candle. Returns (symbol, tf, start, o, h, l, c, v) if confirm is True for DB storage.
        """
        self.last_msg_ts = time.time()
        self.price = c
        candle_list = self.candles.setdefault(tf, [])
        new_bar = [start, o, h, l, c, v]

        if candle_list and candle_list[-1][0] == start:
            # Update currently open candle
            candle_list[-1] = new_bar
        else:
            # Append new candle
            candle_list.append(new_bar)
            max_bars = config.HISTORY_BARS.get(tf, 1000)
            if len(candle_list) > max_bars:
                self.candles[tf] = candle_list[-max_bars:]

        if tf in ("1h", "4h"):
            self.recompute_context()

        if confirm:
            return (self.symbol, tf, start, o, h, l, c, v)
        return None


    def get_candles(self, tf: str, limit: int = 500) -> List[List[float]]:
        candle_list = self.candles.get(tf, [])
        if limit and len(candle_list) > limit:
            return candle_list[-limit:]
        return list(candle_list)

    def get_dataframe(self, tf: str) -> pd.DataFrame:
        data = self.candles.get(tf, [])
        if not data:
            return pd.DataFrame(columns=["ts", "open", "high", "low", "close", "volume"])
        df = pd.DataFrame(data, columns=["ts", "open", "high", "low", "close", "volume"])
        df["ts"] = pd.to_datetime(df["ts"], unit="ms")
        return df


class AppState:
    def __init__(self):
        self.symbols: Dict[str, SymbolState] = {
            s: SymbolState(symbol=s) for s in config.SYMBOLS
        }

    def get_symbol(self, symbol: str) -> Optional[SymbolState]:
        return self.symbols.get(symbol.upper())

    def is_fresh(self, symbol: str) -> bool:
        s = self.get_symbol(symbol)
        return s.is_fresh if s else False

    def get_snapshot(self, symbol: str, tf: str = "15m") -> Dict[str, Any]:
        sym = symbol.upper()
        sym_state = self.get_symbol(sym)
        now_ms = int(time.time() * 1000)

        if not sym_state:
            return {
                "symbol": sym,
                "ts": now_ms,
                "fresh": False,
                "price": 0.0,
                "change24hPct": 0.0,
                "regime": {"state": "ranging", "volatility": "normal", "adx": 0.0},
                "bias": {"h4": "neutral", "h1": "neutral"},
                "setup": {
                    "action": "WAIT",
                    "score": 0,
                    "strategy": None,
                    "entry": 0.0,
                    "sl": 0.0,
                    "tp": 0.0,
                    "rr": 0.0,
                    "qty": 0.0,
                    "riskUsd": 0.0,
                    "reasons": [],
                    "waitReason": "Unknown symbol",
                    "validUntil": 0,
                },
                "liquidity": {
                    "bookImbalance": 0.0,
                    "buyWall": None,
                    "sellWall": None,
                    "takerBuyPct": 50.0,
                    "oiChange15mPct": 0.0,
                    "funding": 0.0,
                    "liq5m": {"longUsd": 0.0, "shortUsd": 0.0},
                },
                "strategies": [
                    {"id": "trend", "state": "idle", "enabled": False},
                    {"id": "reversion", "state": "idle", "enabled": False},
                    {"id": "sweep", "state": "idle", "enabled": False},
                ],
                "candle": {"tf": tf, "t": now_ms, "o": 0.0, "h": 0.0, "l": 0.0, "c": 0.0, "v": 0.0},
                "dailyLimitHit": False,
            }

        candle_list = sym_state.candles.get(tf, [])
        if candle_list:
            last = candle_list[-1]
            candle_obj = {
                "tf": tf,
                "t": int(last[0]),
                "o": float(last[1]),
                "h": float(last[2]),
                "l": float(last[3]),
                "c": float(last[4]),
                "v": float(last[5]),
            }
            price = sym_state.price if sym_state.price > 0 else float(last[4])
        else:
            candle_obj = {"tf": tf, "t": now_ms, "o": 0.0, "h": 0.0, "l": 0.0, "c": 0.0, "v": 0.0}
            price = sym_state.price

        return {
            "symbol": sym,
            "ts": now_ms,
            "fresh": sym_state.is_fresh,
            "price": price,
            "change24hPct": round(sym_state.change_24h_pct, 2),
            "regime": sym_state.regime,
            "bias": sym_state.bias,

            "setup": {
                "action": "WAIT",
                "score": 0,
                "strategy": None,
                "entry": 0.0,
                "sl": 0.0,
                "tp": 0.0,
                "rr": 0.0,
                "qty": 0.0,
                "riskUsd": 0.0,
                "reasons": [],
                "waitReason": "Initializing data feed",
                "validUntil": 0,
            },
            "liquidity": {
                "bookImbalance": 0.0,
                "buyWall": None,
                "sellWall": None,
                "takerBuyPct": 50.0,
                "oiChange15mPct": 0.0,
                "funding": 0.0,
                "liq5m": {"longUsd": 0.0, "shortUsd": 0.0},
            },
            "strategies": [
                {"id": "trend", "state": "idle", "enabled": False},
                {"id": "reversion", "state": "idle", "enabled": False},
                {"id": "sweep", "state": "idle", "enabled": False},
            ],
            "candle": candle_obj,
            "dailyLimitHit": False,
        }



# Global singleton in-memory state
state = AppState()
