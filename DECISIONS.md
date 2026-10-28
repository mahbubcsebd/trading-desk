# Decisions & Performance Log

This log records technical decisions, simplifications, and benchmark measurements as required by the specification.

## Architectural & Library Decisions
- Initialized monorepo with `engine` (FastAPI + uv) and `web` (Next.js 16 + React 19 + Tailwind v4 + shadcn/ui).
- In `engine/pyproject.toml`, configured `package = false` under `[tool.uv]` to run as a direct application with `uv run uvicorn app.main:app`.
- Configured pytest `pythonpath = ["."]` in `engine/pyproject.toml` for standard module discovery.

## Phase P1: Engine Data Layer
- Configured `BybitRestClient` to load instrument rules and 1,000 historical bars for 15m, 1h, and 4h timeframes for XAUUSDT and BTCUSDT.
- Configured `BybitWsClient` to subscribe to klines and tickers with automatic ping (20s) and exponential backoff reconnection.
- Persisted closed candles (`confirm=True`) to SQLite (WAL mode, busy timeout 30s) and kept rolling in-memory buffer (`max 1000` bars) in `SymbolState`.
- Protected endpoints (`/api/health` and `/api/candles`) using `X-Engine-Key` header authentication.

