import time
import pytest
from app.liquidity import OrderBook, SymbolLiquidityTracker


def test_orderbook_snapshot_and_delta():
    ob = OrderBook()
    # Snapshot
    bids = [["80000.0", "1.5"], ["79900.0", "2.0"]]
    asks = [["80100.0", "1.0"], ["80200.0", "3.0"]]
    ob.apply_snapshot(bids, asks)

    assert len(ob.bids) == 2
    assert len(ob.asks) == 2
    assert ob.bids[80000.0] == 1.5
    assert ob.asks[80100.0] == 1.0

    # Delta: update one level, delete another with size 0, add new level
    delta_bids = [["80000.0", "2.5"], ["79900.0", "0.0"], ["79800.0", "4.0"]]
    delta_asks = [["80100.0", "0.0"], ["80150.0", "0.5"]]
    ob.apply_delta(delta_bids, delta_asks)

    assert 79900.0 not in ob.bids  # deleted
    assert 80100.0 not in ob.asks  # deleted
    assert ob.bids[80000.0] == 2.5  # updated
    assert ob.bids[79800.0] == 4.0  # added
    assert ob.asks[80150.0] == 0.5  # added


def test_liquidity_tracker_metrics():
    tracker = SymbolLiquidityTracker(symbol="BTCUSDT")
    price = 80000.0

    # ±0.25% is [79800, 80200]
    # ±0.50% is [79600, 80400]
    bids = [
        ["79900.0", "2.0"],  # within 0.25%, usd = 159,800
        ["79700.0", "10.0"], # within 0.50%, usd = 797,000 -> buy wall!
    ]
    asks = [
        ["80100.0", "1.0"],  # within 0.25%, usd = 80,100
        ["80300.0", "5.0"],  # within 0.50%, usd = 401,500 -> sell wall!
    ]
    tracker.orderbook.apply_snapshot(bids, asks)

    # Add trades
    now_ms = int(time.time() * 1000)
    tracker.add_trade(now_ms, "Buy", 80000.0, 3.0)   # 240,000 USD buy
    tracker.add_trade(now_ms, "Sell", 80000.0, 1.0)  # 80,000 USD sell
    # takerBuyPct = 240,000 / 320,000 = 75.0%

    # Add OI
    past_ms = now_ms - (15 * 60 * 1000)
    tracker.update_oi(past_ms, 10000.0)
    tracker.update_oi(now_ms, 10500.0)  # 5% increase

    # Add funding
    tracker.update_funding(0.00015)

    # Add liquidations
    tracker.add_liquidation(now_ms, "Sell", 80000.0, 0.5)  # 40,000 Long liq
    tracker.add_liquidation(now_ms, "Buy", 80000.0, 1.0)   # 80,000 Short liq

    metrics = tracker.get_metrics(price)

    # 1. Book Imbalance: bidUSD=159800, askUSD=80100
    expected_imb = (159800.0 - 80100.0) / (159800.0 + 80100.0)
    assert pytest.approx(metrics["bookImbalance"], 0.001) == round(expected_imb, 4)

    # 2. Walls
    assert metrics["buyWall"] is not None
    assert metrics["buyWall"]["price"] == 79700.0
    assert metrics["buyWall"]["usd"] == 797000.0

    assert metrics["sellWall"] is not None
    assert metrics["sellWall"]["price"] == 80300.0
    assert metrics["sellWall"]["usd"] == 401500.0

    # 3. Taker Buy %
    assert metrics["takerBuyPct"] == 75.0

    # 4. OI Change 15m
    assert pytest.approx(metrics["oiChange15mPct"], 0.001) == 0.05

    # 5. Funding
    assert metrics["funding"] == 0.00015

    # 6. Liquidations 5m
    assert metrics["liq5m"]["longUsd"] == 40000.0
    assert metrics["liq5m"]["shortUsd"] == 80000.0
