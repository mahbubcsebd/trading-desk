import numpy as np
import pandas as pd
import pytest
from app.indicators import (
    calc_ema,
    calc_sma,
    calc_rsi,
    calc_atr,
    calc_adx,
    calc_bollinger,
    calc_donchian,
    calc_volume_sma,
    compute_indicators,
)


def test_calc_ema():
    series = pd.Series([10.0, 11.0, 12.0, 13.0, 14.0])
    ema = calc_ema(series, period=3)
    # alpha = 2 / (3 + 1) = 0.5
    # ema[0] = 10.0
    # ema[1] = 0.5 * 11 + 0.5 * 10 = 10.5
    # ema[2] = 0.5 * 12 + 0.5 * 10.5 = 11.25
    assert len(ema) == 5
    assert pytest.approx(ema.iloc[1], 0.001) == 10.5
    assert pytest.approx(ema.iloc[2], 0.001) == 11.25


def test_calc_sma():
    series = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0])
    sma = calc_sma(series, period=3)
    assert pd.isna(sma.iloc[0])
    assert pd.isna(sma.iloc[1])
    assert pytest.approx(sma.iloc[2]) == 2.0
    assert pytest.approx(sma.iloc[4]) == 4.0


def test_calc_rsi():
    # Strictly increasing sequence -> RSI should approach 100
    increasing = pd.Series([float(i) for i in range(1, 35)])
    rsi_inc = calc_rsi(increasing, period=14)
    assert rsi_inc.iloc[-1] > 95.0

    # Strictly decreasing sequence -> RSI should approach 0
    decreasing = pd.Series([float(100 - i) for i in range(1, 35)])
    rsi_dec = calc_rsi(decreasing, period=14)
    assert rsi_dec.iloc[-1] < 5.0


def test_calc_atr():
    # Small hand-crafted dataframe
    df = pd.DataFrame({
        "high": [10.0, 12.0, 11.0, 13.0],
        "low": [8.0, 9.0, 10.0, 11.0],
        "close": [9.0, 11.0, 10.5, 12.5],
    })
    # TR:
    # bar 0: 10 - 8 = 2.0
    # bar 1: max(12-9=3, |12-9|=3, |9-9|=0) = 3.0
    # bar 2: max(11-10=1, |11-11|=0, |10-11|=1) = 1.0
    # bar 3: max(13-11=2, |13-10.5|=2.5, |11-10.5|=0.5) = 2.5
    atr = calc_atr(df, period=2)
    assert len(atr) == 4
    assert atr.iloc[0] == 2.0
    # ewm with alpha=0.5:
    # bar 1: 0.5 * 3.0 + 0.5 * 2.0 = 2.5
    assert pytest.approx(atr.iloc[1], 0.01) == 2.5


def test_calc_adx():
    # Strong upward trend -> ADX should grow significantly
    n = 60
    highs = [100.0 + i * 2.0 for i in range(n)]
    lows = [95.0 + i * 2.0 for i in range(n)]
    closes = [98.0 + i * 2.0 for i in range(n)]

    df = pd.DataFrame({"high": highs, "low": lows, "close": closes})
    adx = calc_adx(df, 14)
    assert len(adx) == n
    assert adx.iloc[-1] > 25.0


def test_calc_bollinger():
    series = pd.Series([10.0] * 30)
    upper, mid, lower = calc_bollinger(series, period=20, num_std=2.0)
    # std of constant series is 0
    assert pytest.approx(mid.iloc[-1]) == 10.0
    assert pytest.approx(upper.iloc[-1]) == 10.0
    assert pytest.approx(lower.iloc[-1]) == 10.0


def test_calc_donchian():
    highs = [float(i) for i in range(1, 30)]
    lows = [float(i - 1) for i in range(1, 30)]
    df = pd.DataFrame({"high": highs, "low": lows})

    high_prev, mid, low_prev = calc_donchian(df, period=20)
    # At index 25, high_prev should be max of highs from index 5 to 24 (which is 25.0)
    assert high_prev.iloc[25] == 25.0


def test_compute_indicators():
    n = 100
    df = pd.DataFrame({
        "ts": [1000 + i * 60000 for i in range(n)],
        "open": [100.0 + i for i in range(n)],
        "high": [102.0 + i for i in range(n)],
        "low": [98.0 + i for i in range(n)],
        "close": [101.0 + i for i in range(n)],
        "volume": [1000.0 for _ in range(n)],
    })

    inds = compute_indicators(df)
    assert "ema50" in inds
    assert "rsi14" in inds
    assert "atr14" in inds
    assert "adx14" in inds
    assert "bb_upper" in inds
    assert "donchian_high" in inds
    assert "vol_sma20" in inds
    assert len(inds["rsi14"]) == n
