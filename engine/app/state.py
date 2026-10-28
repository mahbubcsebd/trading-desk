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

    @property
    def is_fresh(self) -> bool:
        if self.last_msg_ts <= 0:
            return False
        return (time.time() - self.last_msg_ts) <= 10.0

    def set_candles(self, tf: str, candle_list: List[List[float]]) -> None:
        """Set history bars, keeping at most HISTORY_BARS[tf]."""
        max_bars = config.HISTORY_BARS.get(tf, 1000)
        if len(candle_list) > max_bars:
            self.candles[tf] = candle_list[-max_bars:]
        else:
            self.candles[tf] = list(candle_list)
        if self.candles[tf] and tf == config.ENTRY_TF:
            self.price = float(self.candles[tf][-1][4])

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


# Global singleton in-memory state
state = AppState()
