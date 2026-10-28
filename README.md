# TradeDesk

A private, fast, clean trading analysis dashboard for **Gold (XAUUSDT)** and **Bitcoin (BTCUSDT)** linear perpetuals on Bybit V5. It analyzes the market live, runs 3 backtested strategies, and displays one ranked **"Best Setup Now"** (BUY, SELL, or WAIT) with entry, stop loss, take profit, position sizing, and point reasons.

## Quick Start

### 1. Configure Environment
Copy `.env.example` to `.env` (engine) and `web/.env.local` (web):
```bash
# Engine (.env)
ENGINE_KEY=your-secret-key-12345
DB_PATH=./tradedesk.db
APP_TZ=UTC

# Web (web/.env.local)
APP_PASSWORD=your-dashboard-password
SESSION_SECRET=your-random-32char-session-secret
ENGINE_URL=http://127.0.0.1:8000
ENGINE_KEY=your-secret-key-12345
```

### 2. Start Development Servers

**Engine (FastAPI + uv):**
```bash
cd engine
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Web Dashboard (Next.js 16 App Router):**
```bash
cd web
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and log in with `APP_PASSWORD`.

---

## Running Strategy Backtests

Backtest the 3 strategies (Donchian Trend, Bollinger Reversion, Liquidity Sweep) over historical 15m candles:
```bash
cd engine
uv run python -m app.backtest --symbol BTCUSDT --days 60
uv run python -m app.backtest --symbol XAUUSDT --days 60
```
Results (In-Sample vs Out-of-Sample metrics and auto-enablement flags) are persisted to SQLite and displayed on the `/backtest` page.

---

## Running Test Suite

Run all unit and integration tests (data layer, vectorised indicators, regime/bias, liquidity tracking, scoring formulas, signal outcomes, journal & daily limits):
```bash
cd engine
uv run pytest
```

---

## Production Deployment

### PM2 Process Manager
Run both the engine and web application as managed background daemons:
```bash
# Build the production Next.js bundle
cd web && npm run build && cd ..

# Start processes using PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Caddy Reverse Proxy (Auto HTTPS)
Caddy terminates HTTPS and proxies requests directly to `127.0.0.1:3000` while keeping port 8000 strictly private:
```bash
DOMAIN=yourdomain.com caddy run --config Caddyfile
```

---

## Disclaimer
> This tool provides quantitative market analysis only, not financial advice. No trading setup is guaranteed. Always test with small position sizes and review live signal outcomes before risking real capital.
