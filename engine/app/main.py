import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import json
from app import config, db
from app.exness import ExnessRestClient, ExnessLivePoller
from app.schemas import SettingsUpdate, JournalCreate
from app.state import state


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("main")

live_poller  = ExnessLivePoller()
rest_client  = ExnessRestClient()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing TradeDesk Database...")
    db.init_db()

    logger.info("Loading initial instrument rules and historical candles via Yahoo Finance (Exness data)...")
    loop = asyncio.get_event_loop()
    try:
        for symbol in config.SYMBOLS:
            sym_state = state.get_symbol(symbol)
            if not sym_state:
                continue

            # Fetch instrument rules (static Exness contract spec)
            rule = rest_client.get_instrument_info(symbol)
            sym_state.instrument = rule
            logger.info(f"{symbol} rules: tickSize={rule.tick_size}, qtyStep={rule.qty_step}, minOrderQty={rule.min_order_qty}")

            # Fetch historical candles for each timeframe (blocking yfinance → thread pool)
            for tf in config.CHART_TFS:
                limit = config.HISTORY_BARS.get(tf, 1000)
                try:
                    bars = await loop.run_in_executor(
                        None,
                        lambda s=symbol, t=tf, lim=limit: rest_client.get_klines(s, t, lim)
                    )
                    sym_state.set_candles(tf, bars)
                    # Persist initial bars to SQLite
                    db_tuples = [
                        (symbol, tf, b[0], b[1], b[2], b[3], b[4], b[5])
                        for b in bars
                    ]
                    db.save_candles(db_tuples)
                    logger.info(f"Loaded {len(bars)} bars for {symbol} ({tf})")
                except Exception as e:
                    logger.error(f"Failed to load historical candles for {symbol} ({tf}): {e}")

            # Recompute context & setup with all timeframes populated
            sym_state.recompute_context()
            sym_state.recompute_setup()
            logger.info(f"Initialized context and setup for {symbol}")

        # Start live price poller (replaces Bybit WebSocket)
        await live_poller.start()
        logger.info("Exness live price poller started.")
    except Exception as e:
        logger.error(f"Error during startup data initialization: {e}", exc_info=True)

    yield

    logger.info("Shutting down Exness live price poller...")
    await live_poller.stop()
    logger.info("Engine shutdown complete.")


app = FastAPI(title="TradeDesk Engine", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_engine_key(x_engine_key: Optional[str] = Header(None)) -> None:
    if config.ENGINE_KEY and x_engine_key != config.ENGINE_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Engine-Key header",
        )


@app.get("/api/health", dependencies=[Depends(verify_engine_key)])
async def health_check() -> Dict[str, Any]:
    feed_status = {}
    for symbol in config.SYMBOLS:
        feed_status[symbol] = "fresh" if state.is_fresh(symbol) else "stale"

    return {
        "ok": True,
        "feed": feed_status,
    }


@app.get("/api/candles", dependencies=[Depends(verify_engine_key)])
async def get_candles_endpoint(
    symbol: str = Query(..., description="Symbol, e.g. BTCUSD, XAUUSD"),
    tf: str = Query("15m", description="Timeframe, e.g. 15m, 1h, 4h"),
    limit: int = Query(500, ge=1, le=1000, description="Number of candles"),
) -> List[List[float]]:
    sym = symbol.upper()
    if sym not in config.SYMBOLS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid symbol '{symbol}'. Supported symbols: {config.SYMBOLS}",
        )
    if tf not in config.CHART_TFS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid timeframe '{tf}'. Supported timeframes: {config.CHART_TFS}",
        )

    sym_state = state.get_symbol(sym)
    if sym_state and sym_state.candles.get(tf):
        return sym_state.get_candles(tf, limit=limit)

    # Fallback to database if in-memory is empty
    return db.get_candles(sym, tf, limit=limit)


@app.get("/api/snapshot", dependencies=[Depends(verify_engine_key)])
async def get_snapshot_endpoint(
    symbol: str = Query(..., description="Symbol, e.g. BTCUSD, XAUUSD"),
    tf: str = Query("15m", description="Timeframe, e.g. 15m, 1h, 4h"),
) -> Dict[str, Any]:
    sym = symbol.upper()
    if sym not in config.SYMBOLS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid symbol '{symbol}'. Supported symbols: {config.SYMBOLS}",
        )
    return state.get_snapshot(sym, tf=tf)


@app.get("/api/backtest", dependencies=[Depends(verify_engine_key)])
async def get_backtest_endpoint(
    symbol: str = Query(..., description="Symbol, e.g. BTCUSD, XAUUSD"),
) -> List[Dict[str, Any]]:
    sym = symbol.upper()
    if sym not in config.SYMBOLS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid symbol '{symbol}'. Supported symbols: {config.SYMBOLS}",
        )

    conn = db.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT strategy, run_at, enabled, metrics_json FROM backtests WHERE symbol = ?",
            (sym,),
        )
        rows = cursor.fetchall()
        if not rows:
            return [
                {
                    "strategy": strat,
                    "symbol": sym,
                    "enabled": False,
                    "run_at": 0,
                    "in_sample": {"trades": 0, "win_rate": 0.0, "avg_r": 0.0, "expectancy": 0.0, "profit_factor": 0.0, "max_drawdown": 0.0, "total_r": 0.0},
                    "out_of_sample": {"trades": 0, "win_rate": 0.0, "avg_r": 0.0, "expectancy": 0.0, "profit_factor": 0.0, "max_drawdown": 0.0, "total_r": 0.0},
                }
                for strat in ["trend", "reversion", "sweep"]
            ]

        results = []
        for r in rows:
            metrics = json.loads(r["metrics_json"]) if r["metrics_json"] else {}
            results.append({
                "strategy": r["strategy"],
                "symbol": sym,
                "enabled": bool(r["enabled"]),
                "run_at": r["run_at"],
                "in_sample": metrics.get("in_sample", {}),
                "out_of_sample": metrics.get("out_of_sample", {}),
            })
        return results
    finally:
        conn.close()
@app.get("/api/signals", dependencies=[Depends(verify_engine_key)])
async def get_signals_endpoint(
    symbol: Optional[str] = Query(None, description="Optional symbol, e.g. BTCUSD, XAUUSD"),
    limit: int = Query(50, ge=1, le=200, description="Max signals to return"),
) -> Dict[str, Any]:
    from app.signals import get_signals_log
    sym = symbol.upper() if symbol else None
    if sym and sym not in config.SYMBOLS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid symbol '{symbol}'. Supported symbols: {config.SYMBOLS}",
        )
    return get_signals_log(symbol=sym, limit=limit)


@app.get("/api/settings", dependencies=[Depends(verify_engine_key)])
async def get_settings_endpoint() -> Dict[str, Any]:
    st = db.get_settings()
    return {
        "balance": float(st.get("balance", "10000.0")),
        "risk_pct": float(st.get("risk_pct", "1.0")),
        "daily_limit_pct": float(st.get("daily_limit_pct", "3.0")),
        "telegram_bot_token": st.get("telegram_bot_token", ""),
        "telegram_chat_id": st.get("telegram_chat_id", ""),
    }


@app.put("/api/settings", dependencies=[Depends(verify_engine_key)])
async def update_settings_endpoint(body: SettingsUpdate) -> Dict[str, Any]:
    if body.balance is not None:
        db.set_setting("balance", str(body.balance))
    if body.risk_pct is not None:
        db.set_setting("risk_pct", str(body.risk_pct))
    if body.daily_limit_pct is not None:
        db.set_setting("daily_limit_pct", str(body.daily_limit_pct))
    if body.telegram_bot_token is not None:
        db.set_setting("telegram_bot_token", body.telegram_bot_token.strip())
    if body.telegram_chat_id is not None:
        db.set_setting("telegram_chat_id", body.telegram_chat_id.strip())

    # Recompute setups across all symbols with new sizing/limits
    for sym in config.SYMBOLS:
        sym_state = state.get_symbol(sym)
        if sym_state:
            sym_state.recompute_setup()

    st = db.get_settings()
    return {
        "balance": float(st.get("balance", "10000.0")),
        "risk_pct": float(st.get("risk_pct", "1.0")),
        "daily_limit_pct": float(st.get("daily_limit_pct", "3.0")),
        "telegram_bot_token": st.get("telegram_bot_token", ""),
        "telegram_chat_id": st.get("telegram_chat_id", ""),
    }


@app.post("/api/telegram/test", dependencies=[Depends(verify_engine_key)])
async def test_telegram_endpoint(body: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    from app.alerts import test_telegram_alert
    custom_token = body.get("telegram_bot_token") if body else None
    custom_chat_id = body.get("telegram_chat_id") if body else None
    ok, msg = await test_telegram_alert(custom_token, custom_chat_id)
    return {"ok": ok, "message": msg}


@app.get("/api/journal", dependencies=[Depends(verify_engine_key)])
async def get_journal_endpoint(
    limit: int = Query(100, ge=1, le=500),
) -> List[Dict[str, Any]]:
    return db.get_journal_trades(limit=limit)


@app.post("/api/journal", dependencies=[Depends(verify_engine_key)])
async def add_journal_endpoint(body: JournalCreate) -> Dict[str, Any]:
    trade_id = db.add_journal_trade(
        symbol=body.symbol,
        side=body.side,
        entry=body.entry,
        exit_price=body.exit,
        sl=body.sl,
        qty=body.qty,
        opened_at=body.opened_at,
        closed_at=body.closed_at,
        notes=body.notes or "",
    )

    # Recompute setups (dailyLimitHit may be triggered)
    for sym in config.SYMBOLS:
        sym_state = state.get_symbol(sym)
        if sym_state:
            sym_state.recompute_setup()

    return {"ok": True, "id": trade_id}


@app.delete("/api/journal/{trade_id}", dependencies=[Depends(verify_engine_key)])
async def delete_journal_endpoint(trade_id: int) -> Dict[str, Any]:
    deleted = db.delete_journal_trade(trade_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")

    # Recompute setups (dailyLimitHit may be un-triggered)
    for sym in config.SYMBOLS:
        sym_state = state.get_symbol(sym)
        if sym_state:
            sym_state.recompute_setup()

    return {"ok": True}


@app.get("/api/journal/stats", dependencies=[Depends(verify_engine_key)])
async def get_journal_stats_endpoint() -> Dict[str, Any]:
    return db.get_journal_stats()


@app.get("/api/stream", dependencies=[Depends(verify_engine_key)])
async def stream_endpoint(
    request: Request,
    symbol: str = Query(..., description="Symbol, e.g. BTCUSD, XAUUSD"),
    tf: str = Query("15m", description="Timeframe, e.g. 15m, 1h, 4h"),
):
    sym = symbol.upper()
    if sym not in config.SYMBOLS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid symbol '{symbol}'. Supported symbols: {config.SYMBOLS}",
        )

    async def event_generator():
        last_payload = None
        while True:
            if await request.is_disconnected():
                break
            snapshot = state.get_snapshot(sym, tf=tf)
            payload = json.dumps(snapshot)
            if payload != last_payload:
                last_payload = payload
                yield f"event: snapshot\ndata: {payload}\n\n"
            else:
                yield ": keepalive\n\n"
            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

