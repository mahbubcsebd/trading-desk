import pandas as pd
import pytest
from app.regime import calc_regime, calc_bias, calc_market_context
from app.state import SymbolState


def test_calc_regime_trending_and_ranging():
    # Strong trend -> ADX >= 22
    n = 60
    trending_df = pd.DataFrame({
        "high": [100.0 + i * 2.0 for i in range(n)],
        "low": [95.0 + i * 2.0 for i in range(n)],
        "close": [98.0 + i * 2.0 for i in range(n)],
    })
    res_trending = calc_regime(trending_df)
    assert res_trending["state"] == "trending"
    assert res_trending["adx"] >= 22.0
    assert res_trending["volatility"] in ("low", "normal", "high")

    # Flat / alternating ranging data -> low ADX
    ranging_closes = [100.0 if i % 2 == 0 else 100.5 for i in range(n)]
    ranging_df = pd.DataFrame({
        "high": [c + 1.0 for c in ranging_closes],
        "low": [c - 1.0 for c in ranging_closes],
        "close": ranging_closes,
    })
    res_ranging = calc_regime(ranging_df)
    assert res_ranging["state"] == "ranging"


def test_calc_bias():
    # Bull bias: EMA50 > EMA200 and close > EMA50
    n = 220
    bull_df = pd.DataFrame({
        "close": [100.0 + i * 0.5 for i in range(n)],
    })
    assert calc_bias(bull_df) == "bull"

    # Bear bias: EMA50 < EMA200 and close < EMA50
    bear_df = pd.DataFrame({
        "close": [300.0 - i * 0.5 for i in range(n)],
    })
    assert calc_bias(bear_df) == "bear"

    # Neutral: insufficient bars or mixed
    short_df = pd.DataFrame({
        "close": [100.0 for _ in range(30)],
    })
    assert calc_bias(short_df) == "neutral"


def test_symbol_state_context_update():
    state = SymbolState(symbol="BTCUSDT")
    n = 60
    bars_1h = [
        [1000 + i * 3600000, 100.0 + i, 102.0 + i, 98.0 + i, 101.0 + i, 50.0]
        for i in range(n)
    ]
    bars_4h = [
        [1000 + i * 14400000, 100.0 + i * 2, 104.0 + i * 2, 96.0 + i * 2, 102.0 + i * 2, 200.0]
        for i in range(n)
    ]

    state.set_candles("1h", bars_1h)
    state.set_candles("4h", bars_4h)

    # Context should be updated automatically
    assert state.regime["state"] in ("trending", "ranging")
    assert state.bias["h1"] in ("bull", "bear", "neutral")
    assert state.bias["h4"] in ("bull", "bear", "neutral")
