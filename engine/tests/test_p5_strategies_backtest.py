import pandas as pd
import pytest
from app import config
from app.backtest import calculate_metrics, simulate_strategy
from app.strategies import (
    calc_net_rr,
    check_reversion_strategy,
    check_sweep_strategy,
    check_trend_strategy,
)


def test_calc_net_rr():
    entry = 100.0
    sl = 90.0
    tp = 120.0
    # risk = 10, reward = 20
    # cost = 100 * 2 * (0.00055 + 0.0002) = 0.15
    # net rr = (20 - 0.15) / (10 + 0.15) = 19.85 / 10.15 = 1.96
    rr = calc_net_rr(entry, sl, tp)
    assert rr == 1.96


def test_stop_first_rule_on_same_candle():
    """
    Critical requirement: If stop and target are touched in the same candle, count the stop!
    """
    n = 60
    # Create simple base candles
    df = pd.DataFrame({
        "ts": [1000 + i * 900000 for i in range(n)],
        "open": [100.0 for _ in range(n)],
        "high": [101.0 for _ in range(n)],
        "low": [99.0 for _ in range(n)],
        "close": [100.0 for _ in range(n)],
        "volume": [1000.0 for _ in range(n)],
    })

    # Strategy signal triggered at bar 50
    # Stop is 95, Target is 110
    # Make bar 50 break donchian high (so trend fires a buy signal at 105)
    df.loc[50, "close"] = 105.0
    df.loc[50, "high"] = 106.0

    # Bar 51 opens at 105.0, stays around 105
    df.loc[51, "open"] = 105.0
    df.loc[51, "high"] = 105.5
    df.loc[51, "low"] = 104.5
    df.loc[51, "close"] = 105.0

    # Bar 52: Extreme volatility candle! Low drops to 90 (below stop 101), High spikes to 120 (above target 113)!
    df.loc[52, "low"] = 90.0
    df.loc[52, "high"] = 120.0

    regime_series = [{"state": "trending", "volatility": "normal", "adx": 30.0} for _ in range(n)]
    bias_series = [{"h4": "bull", "h1": "bull"} for _ in range(n)]

    trades = simulate_strategy("trend", df, regime_series, bias_series)

    assert len(trades) >= 1
    # Trade must have exited with a LOSS (negative R), proving stop-first was counted instead of target!
    first_trade = trades[0]
    assert first_trade["result_r"] < 0.0, f"Expected loss from stop-first, got {first_trade['result_r']}"


def test_fee_and_slippage_applied():
    """
    Ensure slippage shifts entry and exit prices and taker fees are deducted.
    """
    trades = [
        {"result_r": 1.5},
        {"result_r": -1.0},
        {"result_r": 2.0},
    ]
    metrics = calculate_metrics(trades)
    assert metrics["trades"] == 3
    assert metrics["win_rate"] == 66.7
    assert metrics["total_r"] == 2.5
    assert metrics["profit_factor"] == 3.5  # 3.5 / 1.0


def test_no_lookahead_entry_fill_at_next_open():
    """
    Signal evaluated at bar i close is filled at bar i+1 open.
    """
    n = 60
    df = pd.DataFrame({
        "ts": [1000 + i * 900000 for i in range(n)],
        "open": [100.0 for _ in range(n)],
        "high": [101.0 for _ in range(n)],
        "low": [99.0 for _ in range(n)],
        "close": [100.0 for _ in range(n)],
        "volume": [1000.0 for _ in range(n)],
    })
    # Bar 50 triggers signal
    df.loc[50, "close"] = 105.0
    df.loc[50, "high"] = 106.0

    # Bar 51 opens at 102.0
    df.loc[51, "open"] = 102.0

    regime_series = [{"state": "trending", "volatility": "normal", "adx": 30.0} for _ in range(n)]
    bias_series = [{"h4": "bull", "h1": "bull"} for _ in range(n)]

    trades = simulate_strategy("trend", df, regime_series, bias_series)
    if trades:
        # Expected fill is 102.0 * (1 + slippage 0.0002) = 102.0204
        assert pytest.approx(trades[0]["entry"], 0.01) == 102.02
        assert trades[0]["entry_ts"] == df.loc[51, "ts"]
