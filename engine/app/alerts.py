import logging
import os
import httpx

logger = logging.getLogger("alerts")

async def send_telegram_alert(symbol: str, side: str, entry: float, sl: float, tp: float, score: int, strategy: str):
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()

    if not token or not chat_id:
        return

    text = (
        f"🚨 *TradeDesk Alert: {side.upper()} {symbol}*\n\n"
        f"• *Strategy:* {strategy.upper()}\n"
        f"• *Score:* {score}/100\n"
        f"• *Entry:* {entry}\n"
        f"• *Stop Loss:* {sl}\n"
        f"• *Take Profit:* {tp}\n"
    )

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(url, json=payload)
            if res.status_code != 200:
                logger.warning("Failed to send Telegram alert: %s", res.text)
    except Exception as e:
        logger.warning("Error dispatching Telegram alert: %s", e)
