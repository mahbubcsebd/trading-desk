import math
import os
import tempfile
import pytest
from app import config
from app.db import init_db, get_connection
from app.scoring import calculate_position_size, score_signal, evaluate_best_setup
from app.signals import log_signal, update_open_signals_on_candle, get_signals_log
from app.strategies import StrategySignal, calc_net_rr


def test_position_sizing_round_down():
    # Balance: 10,000, risk: 1% => $100 risk
    # Entry: 80,000, Stop: 79,000 => risk per unit = 1,000
    # raw_qty = 100 / 1000 = 0.1
    qty, risk_usd = calculate_position_size(
        balance=10000.0,
        risk_pct=1.0,
        entry=80000.0,
        sl=79000.0,
        qty_step=0.001,
        min_order_qty=0.001,
    )
    assert qty == 0.1
    assert risk_usd == 100.0

    # Test round down with remainder
    # Entry: 80,000, Stop: 79,350 => risk per unit = 650
    # raw_qty = 100 / 650 = 0.153846...
    # with qty_step 0.001, it must round DOWN to 0.153 (not 0.154)
    qty2, _ = calculate_position_size(
        balance=10000.0,
        risk_pct=1.0,
        entry=80000.0,
        sl=79350.0,
        qty_step=0.001,
        min_order_qty=0.001,
    )
    assert qty2 == 0.153
    assert qty2 * 650 <= 100.0  # Actual risk is strictly <= budgeted risk


def test_net_rr_calculation():
    # Entry: 100, Stop: 90 (risk 10), Target: 130 (reward 30)
    # Fees + slippage = 2 * (0.00055 + 0.0002) = 0.0015
    # cost = 100 * 0.0015 = 0.15
    # Net R:R = (30 - 0.15) / (10 + 0.15) = 29.85 / 10.15 = 2.94
    rr = calc_net_rr(entry=100.0, sl=90.0, tp=130.0)
    assert rr == 2.94


def test_score_signal_calculation_and_weights():
    sig = StrategySignal(
        strategy_id="trend",
        side="buy",
        direction=1,
        entry=100.0,
        sl=95.0,
        tp=115.0,
        rr_net=2.94,
        candle_ts=1700000000000,
    )
    bias = {"h4": "bull", "h1": "bull"}  # align = 0.6 + 0.4 = 1.0
    regime = {"state": "trending"}         # regime = 1.0
    liquidity = {
        "bookImbalance": 0.5,             # c1 = 0.5
        "takerBuyPct": 75.0,              # c2 = (75-50)/50 = 0.5
        "oiChange15mPct": 0.02,           # c3 = +1.0 (price rising and OI rising)
        "sellWall": {"price": 120.0},     # c4 = 0.0 (wall is above target 115)
    }
    # raw_flow = (0.5 + 0.5 + 1.0 + 0.0) / 4.0 = 0.5
    # flow = (0.5 + 1.0) / 2.0 = 0.75
    # edge for profit factor 1.8: clamp(1.8 - 1, 0, 1) = 0.8
    # rr = min(2.94 / 3, 1) = 0.98

    score, reasons, comps = score_signal(
        signal=sig,
        bias=bias,
        regime=regime,
        liquidity=liquidity,
        price=101.0,
        candle_open=100.0,
        oos_profit_factor=1.8,
    )

    # Weights: align=0.30, edge=0.25, flow=0.25, regime=0.10, rr=0.10
    # raw_score = 100 * (0.30*1.0 + 0.25*0.8 + 0.25*0.75 + 0.10*1.0 + 0.10*0.98)
    #           = 100 * (0.30 + 0.20 + 0.1875 + 0.10 + 0.098)
    #           = 100 * 0.8855 = 88.55 => 89
    assert score == 89
    assert len(reasons) > 0
    assert comps["align"] == 1.0
    assert comps["edge"] == 0.8
    assert comps["flow"] == 0.75
    assert comps["regime"] == 1.0
    assert pytest.approx(comps["rr"], 0.01) == 0.98


def test_hard_filters_and_wait_reasons():
    sig = StrategySignal(
        strategy_id="trend",
        side="buy",
        direction=1,
        entry=100.0,
        sl=95.0,
        tp=115.0,
        rr_net=2.94,
        candle_ts=1700000000000,
    )
    signals = {"trend": sig, "reversion": None, "sweep": None}
    backtest_info = {"trend": {"enabled": True, "profit_factor": 1.5}}

    # 1. Stale Data
    setup, _ = evaluate_best_setup(
        symbol="BTCUSDT",
        signals=signals,
        backtest_info=backtest_info,
        bias={"h4": "bull", "h1": "bull"},
        regime={"state": "trending"},
        liquidity={},
        price=100.0,
        candle_open=100.0,
        candle_ts=1700000000000,
        is_fresh=False,  # Not fresh!
        daily_limit_hit=False,
        balance=10000.0,
        risk_pct=1.0,
        qty_step=0.001,
        min_order_qty=0.001,
    )
    assert setup["action"] == "WAIT"
    assert setup["waitReason"] == "Data is stale"

    # 2. Daily Limit Hit
    setup2, _ = evaluate_best_setup(
        symbol="BTCUSDT",
        signals=signals,
        backtest_info=backtest_info,
        bias={"h4": "bull", "h1": "bull"},
        regime={"state": "trending"},
        liquidity={},
        price=100.0,
        candle_open=100.0,
        candle_ts=1700000000000,
        is_fresh=True,
        daily_limit_hit=True,  # Hit!
        balance=10000.0,
        risk_pct=1.0,
        qty_step=0.001,
        min_order_qty=0.001,
    )
    assert setup2["action"] == "WAIT"
    assert setup2["waitReason"] == "Daily loss limit reached"

    # 3. Strategy Disabled
    disabled_backtest = {"trend": {"enabled": False, "profit_factor": 0.0}}
    setup3, _ = evaluate_best_setup(
        symbol="BTCUSDT",
        signals=signals,
        backtest_info=disabled_backtest,
        bias={"h4": "bull", "h1": "bull"},
        regime={"state": "trending"},
        liquidity={},
        price=100.0,
        candle_open=100.0,
        candle_ts=1700000000000,
        is_fresh=True,
        daily_limit_hit=False,
        balance=10000.0,
        risk_pct=1.0,
        qty_step=0.001,
        min_order_qty=0.001,
    )
    assert setup3["action"] == "WAIT"
    assert "Run backtest first" in setup3["waitReason"] or "disabled" in setup3["waitReason"]


def test_signals_db_logging_and_outcomes():
    # Create temp DB
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    try:
        init_db(db_path=db_path)

        # 1. Log a BUY signal
        t0 = 1700000000000
        sig_id = log_signal(
            symbol="BTCUSDT",
            strategy="trend",
            side="BUY",
            entry=100.0,
            sl=90.0,
            tp=120.0,
            score=75,
            created_at=t0,
            db_path=db_path,
        )
        assert sig_id is not None

        # Try inserting duplicate: should be ignored due to UNIQUE constraint
        dup_id = log_signal(
            symbol="BTCUSDT",
            strategy="trend",
            side="BUY",
            entry=100.0,
            sl=90.0,
            tp=120.0,
            score=75,
            created_at=t0,
            db_path=db_path,
        )
        # Check that we still have only 1 signal
        log = get_signals_log(symbol="BTCUSDT", db_path=db_path)
        assert len(log["signals"]) == 1
        assert log["signals"][0]["status"] == "open"

        # 2. Test same-candle stop-first rule on candle close
        # Candle touches both SL (90) and TP (120): low=89, high=121
        t1 = t0 + 15 * 60 * 1000
        closed_count = update_open_signals_on_candle(
            symbol="BTCUSDT",
            candle_ts=t1,
            o=100.0,
            h=121.0,
            l=89.0,
            c=110.0,
            db_path=db_path,
        )
        assert closed_count == 1

        updated_log = get_signals_log(symbol="BTCUSDT", db_path=db_path)
        sig = updated_log["signals"][0]
        assert sig["status"] == "closed"
        assert sig["resultR"] == -1.0  # Stop first prioritized!
        assert sig["closedAt"] == t1

        # 3. Log a second signal that hits target
        t2 = t1 + 15 * 60 * 1000
        log_signal(
            symbol="BTCUSDT",
            strategy="sweep",
            side="BUY",
            entry=100.0,
            sl=90.0,
            tp=120.0,
            score=80,
            created_at=t2,
            db_path=db_path,
        )

        t3 = t2 + 15 * 60 * 1000
        # Target hit: low=95, high=122
        closed_count = update_open_signals_on_candle(
            symbol="BTCUSDT",
            candle_ts=t3,
            o=101.0,
            h=122.0,
            l=95.0,
            c=118.0,
            db_path=db_path,
        )
        assert closed_count == 1

        final_log = get_signals_log(symbol="BTCUSDT", db_path=db_path)
        assert len(final_log["signals"]) == 2
        # Target hit trade
        assert final_log["signals"][0]["status"] == "closed"
        assert final_log["signals"][0]["resultR"] > 1.5

        # Live stats check: 2 trades, 1 win, 1 loss => 50% win rate
        stats = final_log["stats"]
        assert stats["count"] == 2
        assert stats["winRate"] == 50.0

    finally:
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception:
                pass
