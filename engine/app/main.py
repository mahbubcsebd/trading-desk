import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import json
from app import config, db
from app.bybit import BybitRestClient, BybitWsClient
from app.state import state


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("main")

ws_client = BybitWsClient()
rest_client = BybitRestClient()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing TradeDesk Database...")
    db.init_db()

    logger.info("Loading initial instrument rules and historical candles via Bybit REST...")
    try:
        for symbol in config.SYMBOLS:
            sym_state = state.get_symbol(symbol)
            if not sym_state:
                continue

            # Fetch instrument rules
            try:
                rule = await rest_client.get_instrument_info(symbol)
                sym_state.instrument = rule
                logger.info(f"{symbol} rules: tickSize={rule.tick_size}, qtyStep={rule.qty_step}, minOrderQty={rule.min_order_qty}")
            except Exception as e:
                logger.warning(f"Failed to fetch instrument rules for {symbol}: {e}")

            # Fetch historical candles for each timeframe
            for tf in config.CHART_TFS:
                interval = config.TF_TO_BYBIT_INTERVAL[tf]
                limit = config.HISTORY_BARS.get(tf, 1000)
                try:
                    bars = await rest_client.get_klines(symbol, interval, limit=limit)
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

        # Start live WebSocket client
        await ws_client.start()
        logger.info("Bybit WebSocket client started.")
    except Exception as e:
        logger.error(f"Error during startup data initialization: {e}", exc_info=True)

    yield

    logger.info("Shutting down Bybit WebSocket client...")
    await ws_client.stop()
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
    symbol: str = Query(..., description="Symbol, e.g. BTCUSDT, XAUUSDT"),
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
    symbol: str = Query(..., description="Symbol, e.g. BTCUSDT, XAUUSDT"),
    tf: str = Query("15m", description="Timeframe, e.g. 15m, 1h, 4h"),
) -> Dict[str, Any]:
    sym = symbol.upper()
    if sym not in config.SYMBOLS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid symbol '{symbol}'. Supported symbols: {config.SYMBOLS}",
        )
    return state.get_snapshot(sym, tf=tf)


@app.get("/api/stream", dependencies=[Depends(verify_engine_key)])
async def stream_endpoint(
    request: Request,
    symbol: str = Query(..., description="Symbol, e.g. BTCUSDT, XAUUSDT"),
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

