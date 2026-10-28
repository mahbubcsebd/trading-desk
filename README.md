# TradeDesk

A private, fast, clean trading analysis dashboard for **Gold (XAUUSDT)** and **BTC (BTCUSDT)** perpetuals on Bybit V5.

## Architecture
- **`engine/`**: Python 3.14 (managed by `uv`), FastAPI, SQLite (WAL mode), Bybit V5 WebSocket & REST clients, Vectorised Technical Indicators, 3 Backtested Strategies, Liquidity Layer, Scoring & Signal Outcome Tracker.
- **`web/`**: Next.js 16 (App Router, Turbopack, TypeScript), React 19, Tailwind CSS v4, shadcn/ui, TradingView Lightweight Charts, Native SSE EventSource consumer.

## Local Development Setup

### 1. Engine (Backend)
```bash
cd engine
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
To run tests:
```bash
uv run pytest
```

### 2. Web (Frontend)
```bash
cd web
npm run dev
```

### 3. Environment Variables
Copy `.env.example` to `.env` in both `engine` and `web` or configure accordingly.
