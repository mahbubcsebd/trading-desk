from fastapi.testclient import TestClient
from app.main import app
from app import config

client = TestClient(app)

def test_health():
    response = client.get("/api/health", headers={"X-Engine-Key": config.ENGINE_KEY})
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert "feed" in data
