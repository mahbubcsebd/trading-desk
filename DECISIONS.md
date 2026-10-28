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

## Phase P2: Web Shell, Auth, & Live Chart
- Implemented `/api/snapshot` and `/api/stream` (SSE throttled to at most 1 event per second) in the engine.
- Implemented Web Crypto API HMAC-SHA256 session token generation and verification (`lib/session.ts`) with 7-day httpOnly, sameSite=lax cookie.
- Built in-memory rate limiting (max 5 attempts per 15 minutes per IP) with constant-time SHA-256 hash comparison in `/api/login`.
- Configured Next.js 16 auth gate in `proxy.ts` redirecting unauthenticated traffic to `/login`.
- Built server-only `lib/engine.ts` guaranteeing that `ENGINE_KEY` and `ENGINE_URL` are strictly isolated from client bundles.
- Implemented native `EventSource` live hook (`lib/use-live.ts`) and `web/app/api/stream/route.ts` proxy forwarding the client abort signal.
- Integrated `lightweight-charts` with `series.update()` for real-time live candle updates without full redraws.

## Phase P3: Indicators, Regime, & Bias
- Implemented vectorised indicators (`indicators.py`) in pure numpy/pandas: EMA, RSI(14), ATR(14), ADX(14), Bollinger Bands(20, 2), Donchian(20), and Volume SMA(20) capped at 500 bars.
- Implemented 1h regime (`trending` if ADX >= 22 else `ranging`) and rolling 200-bar ATR volatility rank (`low` < 30, `normal` 30-70, `high` > 70).
- Implemented multi-timeframe trend bias (`bull`, `bear`, `neutral`) on 1h and 4h using EMA50 and EMA200.
- Automatic context recomputation integrated on 1h/4h candle updates in `SymbolState`.
- 18 pytest tests passing with hand-verified calculation fixtures.

## Phase P4: Liquidity Layer
- Built local `OrderBook` tracking Bybit `orderbook.50.<symbol>` snapshots and deltas, pruning zero-size levels to avoid dictionary bloat.
- Implemented `bookImbalance` over ±0.25% price range, and dynamic `buyWall` / `sellWall` detection within ±0.50% range.
- Implemented rolling 5-minute trade deque for `takerBuyPct`, 15-minute `oiChange15mPct`, current funding, and 5-minute liquidation volume tracking (`longUsd` / `shortUsd`).
- Throttled metric calculations to at most once per second for negligible CPU footprint at idle and high tick rates.
- Verified live WebSocket streaming with 50-level orderbook and real-time taker flow on BTCUSDT and XAUUSDT.

## Phase P5: Strategies & Backtesting
- Implemented three pure-function strategies in `engine/app/strategies.py`:
  - `trend`: Donchian 20-bar breakout with EMA fast > slow filter and ADX >= 22.
  - `reversion`: Bollinger Band mean reversion with RSI(14) oversold (<30) / overbought (>70) confirmation in ranging regimes.
  - `sweep`: Liquidity sweep beyond 20-bar high/low followed by close reclaim, taker imbalance, and volume expansion >= 1.2x.
- Built backtest simulation engine (`engine/app/backtest.py`) with zero lookahead:
  - Strict entry fill on the immediate next bar Open (`i + 1`).
  - Realistic cost modeling: Fee (0.055% maker/taker) and Slippage (0.02%) applied on both entry and exit.
  - Conservative stop-loss priority: if a single bar touches both SL and TP, the stop loss is executed first.
  - 70% In-Sample / 30% Out-of-Sample chronological train/test split.
  - Dynamic strategy enablement flag: strategy is auto-enabled only if OOS Profit Factor >= 1.1 and OOS Expectancy > 0.
- Implemented CLI runner (`python -m app.backtest --symbol BTCUSDT --days 60`) saving metrics to SQLite `backtests` table.
- Exposed `/api/backtest` in FastAPI and integrated full `/backtest` comparison dashboard with limitation notices and live signal log table.

## Phase P6: Scoring, Best Setup, & Signal Log
- Implemented multi-factor scoring formula in `engine/app/scoring.py` with normalized components:
  - Alignment (0.30): 4h bias (0.6) and 1h bias (0.4) matching trade direction.
  - Edge (0.25): Backtest out-of-sample profit factor clamp(`profit_factor - 1`, 0, 1).
  - Flow (0.25): Average of book imbalance, taker flow, OI confirmation, and wall block.
  - Regime (0.10): Strategy fit with 1h ADX market regime.
  - Net R:R (0.10): Net risk-to-reward clamped to `[0, 1]`.
- Enforced hard filters: Strategy enabled, data freshness <= 10s, net R:R >= 1.5, daily loss limit not hit, position size >= `minOrderQty`.
- WAIT state always provides an explicit reason (e.g. "Data is stale", "Daily loss limit reached", "Run backtest first", "Best score X, needs 60").
- Position sizing uses `floor(riskUsd / |entry - sl|, qtyStep)` to guarantee risk never exceeds budgeted risk %.
- Built signal logger and outcome tracker in `engine/app/signals.py` with stop-first priority on simultaneous stop/target touch and 32-bar max hold.
- Integrated `GET /api/signals` in FastAPI and connected live signal log with live forward-test stats (Trades, Win Rate %, Avg R, Expectancy) in `/backtest` page.
