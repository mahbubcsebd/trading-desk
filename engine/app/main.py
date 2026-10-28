from fastapi import FastAPI

app = FastAPI(title="TradeDesk Engine", version="0.1.0")

@app.get("/api/health")
async def health_check():
    return {
        "ok": True,
        "feed": {
            "XAUUSDT": "fresh",
            "BTCUSDT": "fresh",
        },
    }
