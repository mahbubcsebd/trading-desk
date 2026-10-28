import os
import tempfile
import pytest
from fastapi.testclient import TestClient
from app import config, db
from app.main import app
from app.state import state, InstrumentRule


@pytest.fixture
def client():
    return TestClient(app)


def test_auth_rejection(client):
    # Without X-Engine-Key
    res = client.get("/api/health")
    assert res.status_code == 401

    # With invalid key
    res = client.get("/api/health", headers={"X-Engine-Key": "wrong-key"})
    assert res.status_code == 401


def test_health_with_auth(client):
    res = client.get("/api/health", headers={"X-Engine-Key": config.ENGINE_KEY})
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "feed" in data
    assert "BTCUSDT" in data["feed"]
    assert "XAUUSDT" in data["feed"]


def test_db_operations():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    try:
        db.init_db(db_path)
        settings = db.get_settings(db_path)
        assert "balance" in settings
        assert float(settings["balance"]) == 10000.0

        # Save and retrieve candles
        candles_data = [
            ("BTCUSDT", "15m", 1000, 100.0, 110.0, 95.0, 105.0, 50.0),
            ("BTCUSDT", "15m", 2000, 105.0, 115.0, 102.0, 112.0, 60.0),
        ]
        db.save_candles(candles_data, db_path)

        retrieved = db.get_candles("BTCUSDT", "15m", limit=10, db_path=db_path)
        assert len(retrieved) == 2
        # Oldest first
        assert retrieved[0][0] == 1000
        assert retrieved[1][0] == 2000
        assert retrieved[1][4] == 112.0
    finally:
        if os.path.exists(db_path):
            os.remove(db_path)


def test_state_candle_update():
    sym_state = state.get_symbol("BTCUSDT")
    assert sym_state is not None

    # Initial set
    bars = [
        [1000, 100.0, 105.0, 98.0, 102.0, 10.0],
        [2000, 102.0, 108.0, 101.0, 107.0, 12.0],
    ]
    sym_state.set_candles("15m", bars)
    assert sym_state.price == 107.0

    # In-progress update (same timestamp)
    confirmed = sym_state.update_candle("15m", 2000, 102.0, 110.0, 101.0, 109.0, 15.0, confirm=False)
    assert confirmed is None
    assert sym_state.price == 109.0
    latest = sym_state.get_candles("15m", limit=1)
    assert latest[0][4] == 109.0  # close updated
    assert latest[0][2] == 110.0  # high updated

    # Closed candle update (confirm=True)
    confirmed = sym_state.update_candle("15m", 2000, 102.0, 110.0, 101.0, 109.5, 16.0, confirm=True)
    assert confirmed is not None
    assert confirmed[0] == "BTCUSDT"
    assert confirmed[1] == "15m"
    assert confirmed[2] == 2000
    assert confirmed[6] == 109.5  # close


def test_candles_api(client):
    # Populate memory state
    sym_state = state.get_symbol("BTCUSDT")
    sym_state.set_candles("15m", [
        [1000, 100.0, 105.0, 98.0, 102.0, 10.0],
        [2000, 102.0, 108.0, 101.0, 107.0, 12.0],
    ])

    # Valid request
    res = client.get(
        "/api/candles?symbol=BTCUSDT&tf=15m&limit=5",
        headers={"X-Engine-Key": config.ENGINE_KEY},
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    assert data[0][0] == 1000

    # Invalid symbol
    res = client.get(
        "/api/candles?symbol=INVALID&tf=15m",
        headers={"X-Engine-Key": config.ENGINE_KEY},
    )
    assert res.status_code == 400

    # Invalid tf
    res = client.get(
        "/api/candles?symbol=BTCUSDT&tf=30m",
        headers={"X-Engine-Key": config.ENGINE_KEY},
    )
    assert res.status_code == 400


def test_snapshot_api(client):
    res = client.get(
        "/api/snapshot?symbol=BTCUSDT&tf=15m",
        headers={"X-Engine-Key": config.ENGINE_KEY},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["symbol"] == "BTCUSDT"
    assert "candle" in data
    assert "regime" in data
    assert "bias" in data
    assert "setup" in data
    assert "liquidity" in data

