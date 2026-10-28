import os
import tempfile
import time
import pytest
from app import config
from app.db import (
    init_db,
    get_settings,
    set_setting,
    add_journal_trade,
    get_journal_trades,
    delete_journal_trade,
    get_journal_stats,
    check_daily_limit_hit,
)
from app.scoring import calculate_position_size, evaluate_best_setup
from app.strategies import StrategySignal


def test_settings_storage_and_sizing_impact():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    try:
        init_db(db_path=db_path)
        defaults = get_settings(db_path=db_path)
        assert float(defaults["balance"]) == 10000.0
        assert float(defaults["risk_pct"]) == 1.0
        assert float(defaults["daily_limit_pct"]) == 3.0

        # Change balance to $50,000 and risk to 2% ($1,000 risk)
        set_setting("balance", "50000.0", db_path=db_path)
        set_setting("risk_pct", "2.0", db_path=db_path)

        updated = get_settings(db_path=db_path)
        assert float(updated["balance"]) == 50000.0
        assert float(updated["risk_pct"]) == 2.0

        # Check that position sizing updates proportionally
        # Entry: 80,000, Stop: 79,000 => risk per unit = 1,000
        # budgeted risk = 50,000 * 0.02 = 1,000 USD => qty = 1.0 BTC
        qty, risk_usd = calculate_position_size(
            balance=float(updated["balance"]),
            risk_pct=float(updated["risk_pct"]),
            entry=80000.0,
            sl=79000.0,
            qty_step=0.001,
            min_order_qty=0.001,
        )
        assert qty == 1.0
        assert risk_usd == 1000.0
    finally:
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception:
                pass


def test_journal_pnl_and_r_multiple():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    try:
        init_db(db_path=db_path)

        # 1. Winning BUY trade on BTCUSD
        # Entry: 80,000, Exit: 82,000 (gain 2,000), SL: 79,000 (risk 1,000), Qty: 0.1 BTC
        # Gross gain = 2,000 * 0.1 = $200
        # Cost = 80,000 * 0.1 * 2 * (0.00055 + 0.0002) = 8,000 * 0.0015 = $12
        # Net PnL = 200 - 12 = $188
        # Risk denom = (1,000 * 0.1) + 12 = 100 + 12 = $112
        # R-Multiple = 188 / 112 = 1.68R
        trade_id = add_journal_trade(
            symbol="BTCUSD",
            side="BUY",
            entry=80000.0,
            exit_price=82000.0,
            sl=79000.0,
            qty=0.1,
            notes="Turtle breakout win",
            db_path=db_path,
        )
        assert trade_id is not None

        trades = get_journal_trades(db_path=db_path)
        assert len(trades) == 1
        t = trades[0]
        assert t["pnlUsd"] == 188.0
        assert t["rMultiple"] == 1.68

        # Stats check
        stats = get_journal_stats(db_path=db_path)
        assert stats["trades"] == 1
        assert stats["winRate"] == 100.0
        assert stats["totalR"] == 1.68
        assert stats["todayPnlUsd"] == 188.0
        assert stats["dailyLimitHit"] is False
    finally:
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception:
                pass


def test_daily_loss_limit_and_delete_update():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    try:
        init_db(db_path=db_path)
        # Default balance $10,000, daily limit 3% => max loss $300
        # Log a losing trade with -$350 loss
        trade_id = add_journal_trade(
            symbol="XAUUSD",
            side="BUY",
            entry=2700.0,
            exit_price=2660.0,  # Loss of $40/oz on 10 oz = -$400 gross
            sl=2660.0,
            qty=10.0,
            notes="Failed sweep",
            db_path=db_path,
        )

        stats = get_journal_stats(db_path=db_path)
        assert stats["todayPnlUsd"] < -300.0
        assert stats["dailyLimitHit"] is True
        assert check_daily_limit_hit(balance=10000.0, daily_limit_pct=3.0, db_path=db_path) is True

        # Check that evaluate_best_setup locks setup when dailyLimitHit is true
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
        setup, _ = evaluate_best_setup(
            symbol="BTCUSD",
            signals={"trend": sig, "reversion": None, "sweep": None},
            backtest_info={"trend": {"enabled": True, "profit_factor": 1.5}},
            bias={"h4": "bull", "h1": "bull"},
            regime={"state": "trending"},
            liquidity={},
            price=100.0,
            candle_open=100.0,
            candle_ts=1700000000000,
            is_fresh=True,
            daily_limit_hit=True,
            balance=10000.0,
            risk_pct=1.0,
            qty_step=0.001,
            min_order_qty=0.001,
        )
        assert setup["action"] == "WAIT"
        assert setup["waitReason"] == "Daily loss limit reached"

        # Now delete the losing trade
        deleted = delete_journal_trade(trade_id, db_path=db_path)
        assert deleted is True

        # Check stats after deletion
        after_stats = get_journal_stats(db_path=db_path)
        assert after_stats["trades"] == 0
        assert after_stats["todayPnlUsd"] == 0.0
        assert after_stats["dailyLimitHit"] is False
    finally:
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception:
                pass
