# TradeDesk: Build Specification

A private, fast, clean trading analysis dashboard for **Gold (XAUUSDT) and BTC (BTCUSDT)**. It analyses the market live, runs three backtested strategies, and shows **one ranked "Best Setup Now"** with entry, stop, target, position size and the reasons. Analysis only. No auto-execution in v1.

> Give this whole file to the AI agent with this instruction: *"Read the entire spec. Build it phase by phase in the given order. Finish and verify each phase's 'Done when' checks before starting the next. Follow the working rules exactly."*

---

## 0. Working rules for the agent

1. Read the whole spec first. Build Phases P0 to P8 in order. Verify "Done when" before moving on. Commit after each phase.
2. **Use the latest stable version of every technology.** Install with `@latest` / `uv add`. Do **not** pin old versions to match this document. For Next.js, React, Tailwind, shadcn/ui, FastAPI and the Bybit V5 API, read the official docs for the installed version instead of relying on memory, because APIs and file conventions change (for example, Next.js renames, async request APIs, caching defaults).
3. **Use only the libraries listed in section 2.** Add no other library and no feature that is not in this spec. If something is ambiguous, pick the simplest option and add one line to `DECISIONS.md`.
4. Keep code small and direct: no speculative abstractions, no dead code, no comments that restate the code.
5. Secrets live only in `.env` files. Never in client code, never in git.
6. Frontend data fetching uses **Next.js native `fetch` only** (no axios, SWR or React Query). Live data uses native `EventSource`.
7. UI language is English. Prices are never invented: if data is stale or missing, say so.

---

## 1. Product principles

| Principle | Meaning |
|---|---|
| One answer first | The top of the dashboard is a single "Best Setup Now" card: BUY, SELL or WAIT. Everything else is supporting detail. |
| Honest numbers | Show expectancy, profit factor and drawdown from tests, not just hit rate. No guarantee claims anywhere. |
| Fast | Server Components by default, tiny client JS, one live stream, throttled updates. |
| Simple | 3 pages, 1 database file, 2 processes. No Redis, no Postgres, no extra services in v1. |
| Safe | Risk sizing built in. Daily loss limit locks new setups. |

### v1 non-goals (do not build)

Auto-execution, multi-user accounts, macro/news/economic calendar feed, LLM features, mobile app, light theme, extra indicators toolbar, extra pages, Redis, Postgres, websockets to the browser (use SSE).

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Web | Next.js (App Router, TypeScript, Turbopack), React, Tailwind CSS, shadcn/ui, `lightweight-charts`, `lucide-react`, `next/font` |
| Engine | Python (latest stable), `uv`, FastAPI, uvicorn, `httpx`, `websockets`, `numpy`, `pandas`, `pytest` (dev) |
| Storage | SQLite (single file, WAL mode) via stdlib `sqlite3` |
| Data | Bybit V5 public API, `category=linear` (REST + WebSocket), no API key needed |
| Process / deploy | PM2, Caddy (auto HTTPS), optional GitHub Actions |

Indicators (EMA, RSI, ATR, ADX, Bollinger, Donchian) are implemented in `indicators.py` with numpy/pandas. Do not add TA-Lib or pandas-ta.

shadcn components to add (and no more): `button card tabs dialog input label table badge skeleton select`.

---

## 3. Repository layout

```
trade-desk/
├─ engine/
│  ├─ pyproject.toml
│  ├─ app/
│  │  ├─ main.py         # FastAPI app, routes, lifespan (starts feed + loops)
│  │  ├─ config.py       # symbols, timeframes, weights, thresholds, fees
│  │  ├─ db.py           # sqlite connection + schema
│  │  ├─ bybit.py        # REST client + WebSocket client (reconnect, resubscribe)
│  │  ├─ state.py        # in-memory live state per symbol
│  │  ├─ indicators.py
│  │  ├─ regime.py       # regime + bias
│  │  ├─ liquidity.py    # order book, taker flow, OI, funding, liquidations
│  │  ├─ strategies.py   # trend, reversion, sweep (pure functions)
│  │  ├─ backtest.py     # engine + CLI + enable/disable logic
│  │  ├─ scoring.py      # score, risk sizing, setup builder
│  │  ├─ signals.py      # signal log + outcome tracker
│  │  └─ schemas.py
│  └─ tests/
├─ web/
│  ├─ proxy.ts                      # auth gate (named middleware.ts in older Next.js; use what the installed version expects)
│  ├─ app/
│  │  ├─ layout.tsx  globals.css
│  │  ├─ login/page.tsx
│  │  ├─ api/login/route.ts  api/logout/route.ts
│  │  ├─ api/stream/route.ts        # SSE proxy to engine
│  │  └─ (app)/
│  │     ├─ layout.tsx              # top nav
│  │     ├─ page.tsx                # Dashboard
│  │     ├─ backtest/page.tsx
│  │     └─ journal/page.tsx
│  ├─ components/  (SetupCard, Chart, ContextPanel, LiquidityPanel, StrategiesPanel, SettingsDialog, JournalForm, ...)
│  └─ lib/  (engine.ts, session.ts, types.ts, format.ts, use-live.ts)
├─ ecosystem.config.js
├─ .env.example
├─ README.md
└─ DECISIONS.md
```

---

## 4. Data source: Bybit V5 (verify against official docs before coding)

Base REST: `https://api.bybit.com`. Public WebSocket: `wss://stream.bybit.com/v5/public/linear`.

| Need | Endpoint / topic |
|---|---|
| Instrument rules (tickSize, qtyStep, minOrderQty) | `GET /v5/market/instruments-info?category=linear&symbol=` |
| Candles (history, up to 1000 per call, newest first) | `GET /v5/market/kline?category=linear&symbol=&interval=15&limit=1000` |
| Live candles | WS `kline.15.<SYMBOL>`, `kline.60.<SYMBOL>`, `kline.240.<SYMBOL>` |
| Order book | WS `orderbook.50.<SYMBOL>` (snapshot, then deltas; keep a local book) |
| Trades (taker flow) | WS `publicTrade.<SYMBOL>` |
| Price, OI, funding | WS `tickers.<SYMBOL>` (and REST `/v5/market/tickers` on start) |
| Liquidations | WS `allLiquidation.<SYMBOL>` (confirm the topic name in docs) |

Rules: send WS ping as required, reconnect with exponential backoff, resubscribe on reconnect, mark state `fresh=false` if no message for more than 10 seconds. Bybit blocks some regions: choose a VPS region where the API is reachable and follow Bybit's terms.

`XAUUSDT` is a Bybit **perpetual** (a proxy for gold, not spot gold). Show this in the UI tooltip and footer.

---

## 5. Engine specification

### 5.1 Config (`config.py`)

```
SYMBOLS = ["XAUUSDT", "BTCUSDT"]
ENTRY_TF = "15m";  BIAS_TFS = ["1h", "4h"];  CHART_TFS = ["15m", "1h", "4h"]
HISTORY_BARS = {"15m": 1000, "1h": 1000, "4h": 1000}      # live state
BACKFILL_BARS = {"15m": 30000}                              # for backtest, via CLI
TAKER_FEE = 0.00055; SLIPPAGE = 0.0002                      # per side, verify fees in Bybit docs
SCORE_MIN = 60; RR_MIN = 1.5; SIGNAL_EXPIRY_BARS = 32
WEIGHTS = {"align": .30, "edge": .25, "flow": .25, "regime": .10, "rr": .10}
ADX_TREND = 22
```

### 5.2 Indicators (`indicators.py`)

EMA, RSI(14), ATR(14), ADX(14), Bollinger(20, 2), Donchian(20), SMA of volume(20). Vectorised numpy/pandas, no loops over bars where avoidable. Compute on the last 500 bars only. Add pytest tests with hand-checked small fixtures.

### 5.3 Regime and bias (`regime.py`)

- **Regime (1h):** `trending` if ADX(14) ≥ `ADX_TREND`, else `ranging`. **Volatility:** ATR(14) percentile over the last 200 bars: `<30` low, `30-70` normal, `>70` high.
- **Bias per timeframe (1h, 4h):** `bull` if EMA50 > EMA200 and close > EMA50; `bear` if EMA50 < EMA200 and close < EMA50; else `neutral`.

### 5.4 Strategies (`strategies.py`)

Pure functions: `(candles_df, indicators, regime, bias) -> Signal | None`. Evaluated **only on a newly closed 15m candle**. Entry price = close of the signal candle (backtest fills at the next candle open). All three are candle-based, so they are fully backtestable.

| Id | Idea | Long rule (short is the mirror) | Stop | Target |
|---|---|---|---|---|
| `trend` | Donchian breakout, trend following (Turtle style) | Regime `trending`; 4h bias `bull` and 1h bias not `bear`; close above the highest high of the previous 20 bars | entry − 2×ATR | entry + 2×(entry − stop) |
| `reversion` | Range mean reversion | Regime `ranging`; previous close below lower Bollinger band, current close back inside it, previous RSI < 35 | lowest low of last 3 bars − 0.25×ATR | Bollinger mid (SMA20); skip if net R:R < `RR_MIN` |
| `sweep` | Liquidity sweep and reclaim | Low breaks the previous 20-bar low but the bar closes above it; lower wick ≥ 50% of bar range; volume ≥ 1.2×SMA(20); 4h bias `bull` or `neutral` | bar low − 0.25×ATR | entry + 2×(entry − stop) |

### 5.5 Liquidity layer (`liquidity.py`, live only)

Order book depth, taker flow, OI and liquidations **cannot be backtested** with Bybit's public history. They are used as live confirmation and judged by the live signal-outcome log (5.8). Metrics, recomputed at most once per second:

- `bookImbalance` = (bidUSD − askUSD) / (bidUSD + askUSD) within ±0.25% of price.
- `buyWall` / `sellWall`: largest single level within ±0.5% of price (price, USD).
- `takerBuyPct`: share of taker buy volume over the last 5 minutes.
- `oiChange15mPct`: OI change over 15 minutes. `funding`: current funding rate.
- `liq5m`: long and short liquidation USD in the last 5 minutes (**display only**).

### 5.6 Scoring and risk (`scoring.py`)

For each strategy signal with direction `d` (+1 buy, −1 sell):

- `align`: 0.6 if 4h bias matches `d`, plus 0.4 if 1h bias matches `d` (neutral or against = 0).
- `edge`: from the latest backtest out-of-sample result: `clamp(profit_factor − 1, 0, 1)`.
- `flow`: average of four components, each in [−1, 1], mapped to [0, 1]:
  book imbalance × d; (takerBuyPct − 50)/50 × d; OI confirmation (OI rising with price moving in `d` = +1, OI rising with price against `d` = −1, else 0); wall block (an opposing wall between entry and target = −1, else 0).
- `regime`: 1 if the strategy fits the regime (`trend` needs trending, `reversion` needs ranging, `sweep` always 1), else 0.
- `rr`: `min(rr_net / 3, 1)`.

```
score = round(100 * (w.align*align + w.edge*edge + w.flow*flow + w.regime*regime + w.rr*rr))
```

**Net R:R** = (|target − entry| − cost) / (|entry − stop| + cost), where `cost = entry * 2 * (TAKER_FEE + SLIPPAGE)`.

**Hard filters** (any fail = no trade): strategy `enabled` (5.7), data `fresh`, `rr_net ≥ RR_MIN`, daily loss limit not reached, size ≥ `minOrderQty`.

**Result:** the highest-scoring valid signal with `score ≥ SCORE_MIN` becomes the setup (`BUY`/`SELL`). Otherwise `WAIT` with one plain-language `waitReason`. A setup stays valid until the next 15m close or until price drifts more than 0.5×ATR from entry, then it is shown as expired. Weights and thresholds are starting values, to be tuned from backtest and live outcomes.

**Position size:** `riskUsd = balance × risk%`; `qty = riskUsd / |entry − stop|`, rounded **down** to `qtyStep`. Balance, risk % (default 1) and daily loss limit % (default 3) come from settings.

### 5.7 Backtest (`backtest.py`, CLI: `uv run python -m app.backtest --symbol BTCUSDT`)

- Backfill candles into SQLite (paginate kline calls) if missing.
- Run each strategy on 15m history. Rules: signal on candle close, fill at **next candle open**, fees and slippage both sides, one open position per strategy, **if stop and target hit in the same candle, count the stop**, force-close after `SIGNAL_EXPIRY_BARS`.
- **Validation:** split by time, first 70% in-sample, last 30% out-of-sample. Report both.
- Metrics per strategy and period: trades, win rate, average R, expectancy (R), profit factor, max drawdown (R), total R.
- A strategy is `enabled` for that symbol only if **out-of-sample** trades ≥ 30, expectancy > 0 and profit factor ≥ 1.2. Save results and the enabled flag to the `backtests` table. Never backtested = disabled (dashboard says "Run backtest first").
- Document the limitation in the Backtest page: the liquidity layer is not part of the backtest.

### 5.8 Signal log and outcome tracker (`signals.py`)

On every new `BUY`/`SELL` setup insert one row (unique per symbol, strategy, candle). On each closed 15m candle, update open signals using that candle's high/low: stop first if both are touched, otherwise target; after `SIGNAL_EXPIRY_BARS` close at candle close. Store `result_r`. This gives honest live forward-test stats that include the liquidity layer.

---

## 6. Database (SQLite, `db.py`)

```sql
candles(symbol TEXT, tf TEXT, ts INTEGER, o REAL, h REAL, l REAL, c REAL, v REAL, PRIMARY KEY(symbol, tf, ts));
signals(id INTEGER PRIMARY KEY, symbol TEXT, strategy TEXT, side TEXT, entry REAL, sl REAL, tp REAL,
        score INTEGER, created_at INTEGER, status TEXT, closed_at INTEGER, result_r REAL,
        UNIQUE(symbol, strategy, created_at));
backtests(symbol TEXT, strategy TEXT, run_at INTEGER, enabled INTEGER, metrics_json TEXT, PRIMARY KEY(symbol, strategy));
journal(id INTEGER PRIMARY KEY, symbol TEXT, side TEXT, entry REAL, exit REAL, sl REAL, qty REAL,
        opened_at INTEGER, closed_at INTEGER, pnl_usd REAL, r_multiple REAL, notes TEXT);
settings(key TEXT PRIMARY KEY, value TEXT);   -- balance, risk_pct, daily_limit_pct
```

Use WAL mode. Timestamps are UTC milliseconds. Daily limit uses the `APP_TZ` day (default UTC).

---

## 7. Engine API (FastAPI, bound to `127.0.0.1`, header `X-Engine-Key` required)

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{ok, feed: {XAUUSDT: fresh, BTCUSDT: fresh}}` |
| GET | `/api/snapshot?symbol=` | Snapshot (below) |
| GET | `/api/stream?symbol=&tf=` | SSE, event `snapshot`, at most 1 per second and only when changed |
| GET | `/api/candles?symbol=&tf=&limit=500` | `[[ts,o,h,l,c,v], ...]` oldest first |
| GET | `/api/backtest?symbol=` | per strategy: in-sample, out-of-sample, enabled |
| GET | `/api/signals?symbol=&limit=50` | recent signals with outcomes + live stats (count, win rate, avg R, expectancy) |
| GET / PUT | `/api/settings` | balance, risk_pct, daily_limit_pct |
| GET / POST / DELETE | `/api/journal`, `/api/journal/{id}` | trade log; POST computes `pnl_usd` and `r_multiple` |
| GET | `/api/journal/stats` | trades, win rate, total R, expectancy, today's realized PnL, `dailyLimitHit` |

**Snapshot** (keep under 2 KB):

```json
{
  "symbol": "BTCUSDT", "ts": 1730000000000, "fresh": true,
  "price": 80937.9, "change24hPct": 1.2,
  "regime": {"state": "trending", "volatility": "normal", "adx": 27.1},
  "bias": {"h4": "bull", "h1": "bull"},
  "setup": {"action": "BUY", "score": 72, "strategy": "trend",
            "entry": 80940, "sl": 80100, "tp": 82620, "rr": 1.95, "qty": 0.119, "riskUsd": 100,
            "reasons": [{"label": "4h and 1h trend aligned", "points": 30}],
            "waitReason": null, "validUntil": 1730000900000},
  "liquidity": {"bookImbalance": 0.12, "buyWall": {"price": 80867.9, "usd": 967580},
                "sellWall": {"price": 81001.1, "usd": 700100}, "takerBuyPct": 69,
                "oiChange15mPct": -0.02, "funding": 0.0001, "liq5m": {"longUsd": 0, "shortUsd": 120000}},
  "strategies": [{"id": "trend", "state": "signal", "enabled": true},
                 {"id": "reversion", "state": "idle", "enabled": false},
                 {"id": "sweep", "state": "idle", "enabled": true}],
  "candle": {"tf": "15m", "t": 1730000000000, "o": 0, "h": 0, "l": 0, "c": 0, "v": 0},
  "dailyLimitHit": false
}
```

When `action` is `WAIT`, `setup.waitReason` holds one short sentence (for example "No strategy has a valid setup", "Best score 48, needs 60", "Daily loss limit reached", "Data is stale", "Run backtest first").

---

## 8. Frontend specification

### 8.1 Auth and security

- Single shared password in `APP_PASSWORD`. `/api/login` compares in constant time, rate-limits to 5 attempts per 15 minutes per IP (in memory), then sets an **httpOnly, sameSite=lax, secure (in production)** cookie containing an expiry plus an HMAC-SHA256 signature made with `SESSION_SECRET` (Web Crypto API, no auth library). Session lifetime 7 days.
- `proxy.ts` redirects unauthenticated requests to `/login` for everything except `/login`, `/api/login` and static assets.
- The browser **never** talks to the engine. All engine calls go through Server Components, Server Actions or `app/api/stream/route.ts`, via `lib/engine.ts`, which adds `X-Engine-Key` and is server-only.

### 8.2 Data fetching rules

- Server Components fetch initial data with native `fetch`. Live-ish data: `{ cache: 'no-store' }`. Backtest page: `{ next: { revalidate: 300 } }`.
- One client hook, `use-live.ts`: opens `EventSource('/api/stream?symbol=..&tf=..')`, returns the latest snapshot, reconnects automatically, exposes `connected`. No other client data libraries.
- Journal and settings mutations use **Server Actions** that call the engine with `fetch`, then `revalidatePath`.
- The SSE route proxies the engine stream (pipe the response body, pass abort signal, set `Cache-Control: no-store`, `Content-Type: text/event-stream`) after the cookie is verified.

### 8.3 Pages

**`/login`**: centered card, password field, one button. Nothing else.

**`/` Dashboard** (desktop: 12-column grid; mobile: single column in this order)

1. **Top bar:** logo "TradeDesk", asset tabs `Gold | BTC`, a live dot (green = fresh, red = offline) with "updated Xs ago", settings button (opens dialog: balance, risk %, daily limit %).
2. **Setup card ("Best Setup Now")**, left, 1/3 width:
   - Large `BUY` (green), `SELL` (red) or `WAIT` (neutral). Score bar `72 / 100`. Strategy name.
   - Rows: Entry, Stop, Target, R:R, Size, Risk $. A "Copy levels" button.
   - "Why" list: at most 5 reasons, each with points.
   - If `WAIT`: show only the wait reason and the best score seen, nothing else.
   - If expired: grey out with "Setup expired, wait for the next one".
   - If `dailyLimitHit`: locked banner "Daily loss limit reached. No new setups today."
3. **Chart**, right, 2/3 width: candlesticks with timeframe switch `15m | 1h | 4h`. When a setup is active, draw Entry / Stop / Target price lines. Draw buy wall and sell wall as thin dashed lines. No indicator toolbar.
4. **Three compact panels** below:
   - *Market Context:* regime, volatility, 4h bias, 1h bias.
   - *Liquidity:* book imbalance, taker buy %, OI change, funding, nearest walls, 5m liquidations. Each row has a one-word reading (Bullish / Bearish / Neutral) coloured subtly.
   - *Strategies:* the three strategies with state (Signal / Idle / Disabled) and their out-of-sample profit factor.
5. Footer line: "Analysis tool, not financial advice. XAUUSDT is a perpetual, not spot gold."

**`/backtest`:** one table per asset: strategy, period (in-sample / out-of-sample), trades, win rate, expectancy (R), profit factor, max drawdown (R), enabled badge. Under it, a "Live signal results" table from `/api/signals`. A short note about the backtest limitation.

**`/journal`:** one form to log a closed trade (symbol, side, entry, exit, stop, qty, notes), a table of trades with delete, and four stat tiles (trades, win rate, total R, today's PnL). No editing in v1.

### 8.4 UI rules

- Dark theme only. One accent colour. Green and red used **only** for direction and PnL.
- Maximum 6 numbers visible in the setup card. Everything else is in panels.
- Consistent spacing scale, 8px grid, readable base font size, tabular numbers for prices (`font-variant-numeric: tabular-nums`).
- Skeleton loaders on first load, never a blank screen. A clear "Engine offline" banner if health fails.
- Format with `Intl.NumberFormat`. Price decimals come from the instrument tick size.
- Fully usable at 375px width. Touch targets at least 44px.
- Accessible: sufficient contrast, labels on inputs, visible focus states, direction is never conveyed by colour alone (always the word BUY / SELL).

### 8.5 Performance budget

- Server Components by default. Client components only: `Chart`, the live hook consumers, forms, dialogs.
- Single SSE connection per page, max 1 message per second, payload under 2 KB.
- Chart updates use `series.update()` for the last candle, not a full `setData`.
- `next/font` for fonts, `next/dynamic` not required unless the chart bundle blocks first paint.
- Targets: dashboard first paint under 1 second on the VPS, live price latency under 1.5 seconds, Lighthouse performance 90 or higher on desktop. Report the measured numbers in `DECISIONS.md`.

---

## 9. Environment variables (`.env.example`)

```
# engine
ENGINE_KEY=change-me-long-random
DB_PATH=./tradedesk.db
APP_TZ=UTC

# web
APP_PASSWORD=change-me
SESSION_SECRET=change-me-long-random
ENGINE_URL=http://127.0.0.1:8000
ENGINE_KEY=change-me-long-random

# optional (P9)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

---

## 10. Build phases (execute in order)

### P0. Scaffold
- `git init`. Create `web` with `npx create-next-app@latest web` (TypeScript, Tailwind, App Router, Turbopack, ESLint; check `--help` for current flags). In `web`: `npx shadcn@latest init`, then add only the components in section 2; `npm i lightweight-charts lucide-react`.
- Create `engine` with `uv init engine`; `uv add fastapi "uvicorn[standard]" httpx websockets numpy pandas`; `uv add --dev pytest`.
- Add `.env.example`, `.gitignore` (env files, `*.db`), `README.md` with run commands, empty `DECISIONS.md`.
- **Done when:** `npm run build` passes in `web`, `uv run uvicorn app.main:app` serves `/api/health` in `engine`.

### P1. Engine data layer
- `config.py`, `db.py`, `bybit.py`, `state.py`. Fetch instrument rules, load history for all symbols and timeframes, then keep candles live over WebSocket and persist closed candles. Add `/api/health` and `/api/candles` with `X-Engine-Key` check.
- **Done when:** both symbols show fresh candles for 15m, 1h, 4h, the last candle updates live, and killing the network connection then restoring it reconnects automatically.

### P2. Web shell, auth, live price
- `lib/engine.ts`, `lib/session.ts`, `proxy.ts`, `/login`, `/api/login`, `/api/logout`, `(app)/layout.tsx`, Dashboard with asset tabs, `Chart` component (candles, timeframe switch), SSE route and `use-live` hook. Engine `/api/snapshot` and `/api/stream` return price, `fresh` and the `candle` field for now.
- **Done when:** wrong password is rejected and the 6th attempt is rate-limited; unauthenticated visit to `/` redirects to `/login`; after login the chart shows candles and the last candle moves live; the engine URL and key are absent from the browser bundle and network tab.

### P3. Indicators, regime, bias
- `indicators.py`, `regime.py` with pytest tests, add `regime` and `bias` to the snapshot, build the Market Context panel.
- **Done when:** `uv run pytest` passes and the panel updates on 1h and 4h candle close.

### P4. Liquidity layer
- `liquidity.py` (local order book from snapshot + deltas, trade flow, OI, funding, liquidations), add `liquidity` to the snapshot, build the Liquidity panel and chart wall lines.
- **Done when:** metrics move in real time, the book stays consistent after a reconnect, CPU usage of the engine stays low at idle.

### P5. Strategies and backtest
- `strategies.py`, `backtest.py` with CLI, `/api/backtest`, `/backtest` page. Tests: stop-first rule on same-candle touch, fee and slippage application, no look-ahead (signal on close, fill next open).
- Run the backtest for both symbols.
- **Done when:** tests pass, results appear on `/backtest` with in-sample and out-of-sample columns, and enabled flags follow the rule in 5.7.

### P6. Scoring, Best Setup, signal log
- `scoring.py`, `signals.py`, snapshot `setup` and `strategies`, build the Setup card and Strategies panel. Tests for position sizing (round-down to `qtyStep`), net R:R, score formula.
- **Done when:** the card shows BUY/SELL/WAIT with reasons, WAIT always has a reason, signals are logged once per candle, outcomes update after later candles close.

### P7. Journal, settings, daily limit
- Settings dialog and `/api/settings`, `/journal` page with Server Actions, journal stats, `dailyLimitHit` lock on the Setup card.
- **Done when:** changing balance or risk % changes the displayed size on the next snapshot; logging losses beyond the daily limit locks the card; deleting a trade updates stats.

### P8. Harden and deploy
- Error and offline states, skeletons, mobile pass at 375px, measure the performance budget. `ecosystem.config.js` for PM2 (two apps: engine via `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000`, web via `npm start`). Caddy reverse proxy for the web app only; the engine port stays private. Optional GitHub Actions deploy over SSH.
- **Done when:** `npm run build` and `uv run pytest` pass, the app runs on the VPS behind HTTPS, the engine is not reachable from the internet, restarting the server brings both processes back, and measured numbers are in `DECISIONS.md`.

### P9. Optional: Telegram alert
- When a new `BUY`/`SELL` setup is created, send one Telegram message (symbol, side, entry, stop, target, score). Skip if the env vars are empty.
- **Done when:** one message per new setup, none for WAIT.

---

## 11. Definition of done

- Dashboard answers "what is the best trade right now and why" within a few seconds of looking at it.
- Every number on screen traces back to Bybit data or a stored test result.
- No feature outside this spec, no unused dependencies, no secrets in the client.
- `README.md` explains setup, the backtest command, and the deploy steps in under one page.

> Disclaimer shown in the product: this tool provides analysis, not financial advice. No setup is guaranteed. Test on small size first, and review live signal results before trusting any strategy.
