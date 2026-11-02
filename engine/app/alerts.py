import logging
import os
from typing import Any, Dict, List, Optional
import httpx
from app import config, db
from app.chart_snapshot import generate_chart_snapshot

logger = logging.getLogger("alerts")


def get_telegram_config() -> tuple[str, str]:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()

    if not token or not chat_id:
        try:
            settings = db.get_settings()
            token = token or settings.get("telegram_bot_token", "").strip()
            chat_id = chat_id or settings.get("telegram_chat_id", "").strip()
        except Exception:
            pass

    return token, chat_id


async def send_telegram_alert(
    symbol: str,
    side: str,
    entry: float,
    sl: float,
    tp: float,
    score: int,
    strategy: str,
    extra_info: Optional[str] = None,
    candles: Optional[List[List[float]]] = None,
    smc: Optional[Dict[str, Any]] = None,
    lot_size: Optional[float] = None,
) -> bool:
    token, chat_id = get_telegram_config()
    if not token or not chat_id:
        return False

    rules = config.EXNESS_INSTRUMENT_RULES.get(symbol, {})
    decimals = rules.get("decimals", 2)
    p_fmt = f"{{:.{decimals}f}}"

    rr = round(abs(tp - entry) / abs(entry - sl), 2) if abs(entry - sl) > 0 else 2.0
    sl_dist = abs(entry - sl)

    # Emoji styling
    is_buy = side.upper() == "BUY"
    dir_emoji = "🟢" if is_buy else "🔴"
    action_label = "BUY LIMIT / ENTRY" if is_buy else "SELL LIMIT / ENTRY"

    text = (
        f"🚨 *TradeDesk Institutional Signal: {side.upper()} {symbol}*\n\n"
        f"• *Action:* `{action_label}` {dir_emoji}\n"
        f"• *Strategy:* `{strategy.upper()}`\n"
        f"• *Confluence Score:* `{score}/100` ⭐\n"
        f"• *Entry Level:* `{p_fmt.format(entry)}`\n"
        f"• *Stop Loss:* `{p_fmt.format(sl)}` (Risk: `{p_fmt.format(sl_dist)}`)\n"
        f"• *Target (TP):* `{p_fmt.format(tp)}` (1:{rr} R:R) 🎯\n"
    )

    if lot_size and lot_size > 0:
        text += f"• *Recommended 1% Lot:* `{lot_size} Lots` (Exness MT5)\n"

    # SMC Orderflow context
    if smc:
        trend = smc.get("structure", {}).get("trend", "NEUTRAL")
        kz = smc.get("killzone", {}).get("sessionName", "Live Session")
        text += f"\n🏛️ *SMC Orderflow:* `{trend} Structure` • `{kz}`\n"

    if extra_info:
        text += f"• *Context:* {extra_info}\n"

    text += "\n_TradeDesk Institutional Decision Engine • Exness MT5 Real-Time Sync_"

    # 1. Attempt sending with generated Chart Snapshot (sendPhoto)
    photo_sent = False
    if candles and len(candles) >= 10:
        try:
            setup_dict = {
                "action": side.upper(),
                "entry": entry,
                "sl": sl,
                "tp": tp,
                "score": score,
            }
            chart_bytes = generate_chart_snapshot(
                symbol=symbol,
                candles=candles,
                setup=setup_dict,
                smc=smc,
            )

            if chart_bytes and len(chart_bytes) > 1000:
                photo_url = f"https://api.telegram.org/bot{token}/sendPhoto"
                files = {"photo": ("chart.png", chart_bytes, "image/png")}
                data = {
                    "chat_id": chat_id,
                    "caption": text,
                    "parse_mode": "Markdown",
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(photo_url, data=data, files=files)
                    if res.status_code == 200:
                        logger.info("Telegram signal photo delivered for %s %s", side, symbol)
                        return True
                    else:
                        logger.warning("Telegram sendPhoto failed (%s): %s", res.status_code, res.text)
        except Exception as e:
            logger.warning("Error generating or sending chart photo: %s", e)

    # 2. Fallback to text sendMessage if sendPhoto is unavailable or failed
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
    }

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.post(url, json=payload)
            if res.status_code == 200:
                logger.info("Telegram text alert delivered successfully for %s %s", side, symbol)
                return True
            else:
                logger.warning("Failed to send Telegram alert: %s", res.text)
                return False
    except Exception as e:
        logger.warning("Error dispatching Telegram alert: %s", e)
        return False


async def test_telegram_alert(
    custom_token: Optional[str] = None,
    custom_chat_id: Optional[str] = None,
    send_chart: bool = True,
) -> tuple[bool, str]:
    """Sends a test ping (with sample chart snapshot) to verify Telegram Bot credentials."""
    token = custom_token or get_telegram_config()[0]
    chat_id = custom_chat_id or get_telegram_config()[1]

    if not token or not chat_id:
        return False, "Bot Token or Chat ID is missing."

    caption = (
        "✅ *TradeDesk Telegram Integration Active!*\n\n"
        "• *Connection:* Verified & Secure\n"
        "• *Chart Engine:* In-Memory High-Def SMC Renderer\n"
        "• *Execution:* Instant Push on 15m Confluence Triggers\n\n"
        "You will receive instant alerts with on-chart SMC levels whenever an institutional setup fires on Exness MT5."
    )

    # Attempt to send with sample chart
    if send_chart:
        try:
            from app.state import state
            # Fetch active candles from Gold or first available symbol
            sym_state = state.get_symbol("XAUUSD")
            candles = sym_state.candles.get("15m", []) if sym_state else []
            smc = sym_state.smc if sym_state else None
            setup = sym_state.current_setup if sym_state else {"action": "BUY", "entry": 3905.0, "sl": 3898.0, "tp": 3922.0, "score": 88}

            chart_bytes = generate_chart_snapshot(
                symbol="XAUUSD",
                candles=candles if candles else [[1700000000000 + i * 900000, 3900 + i * 0.1, 3902 + i * 0.1, 3898 + i * 0.1, 3901 + i * 0.1, 100] for i in range(40)],
                setup=setup,
                smc=smc,
            )

            if chart_bytes:
                photo_url = f"https://api.telegram.org/bot{token}/sendPhoto"
                files = {"photo": ("chart.png", chart_bytes, "image/png")}
                data = {
                    "chat_id": chat_id,
                    "caption": caption,
                    "parse_mode": "Markdown",
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(photo_url, data=data, files=files)
                    if res.status_code == 200:
                        return True, "Test chart snapshot delivered successfully to Telegram!"
        except Exception as e:
            logger.warning("Failed to deliver test chart snapshot: %s", e)

    # Fallback to sendMessage
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": caption,
        "parse_mode": "Markdown",
    }

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.post(url, json=payload)
            if res.status_code == 200:
                return True, "Test message delivered successfully!"
            else:
                return False, f"Telegram API error ({res.status_code}): {res.text}"
    except Exception as e:
        return False, f"Connection failed: {str(e)}"

