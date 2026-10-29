import logging
import os
from typing import Optional
import httpx
from app import db

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
) -> bool:
    token, chat_id = get_telegram_config()
    if not token or not chat_id:
        return False

    rr = round(abs(tp - entry) / abs(entry - sl), 2) if abs(entry - sl) > 0 else 2.0
    text = (
        f"🚨 *TradeDesk Signal: {side.upper()} {symbol}*\n\n"
        f"• *Action:* `{side.upper()}`\n"
        f"• *Strategy:* `{strategy.upper()}`\n"
        f"• *Confluence Score:* `{score}/100`\n"
        f"• *Entry Level:* `${entry:.2f}`\n"
        f"• *Stop Loss:* `${sl:.2f}`\n"
        f"• *Take Profit:* `${tp:.2f}` (1:{rr} RR)\n"
    )
    if extra_info:
        text += f"• *Context:* {extra_info}\n"

    text += "\n_TradeDesk Institutional Decision Engine (Exness Spot Sync)_"

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
                logger.info("Telegram alert delivered successfully for %s %s", side, symbol)
                return True
            else:
                logger.warning("Failed to send Telegram alert: %s", res.text)
                return False
    except Exception as e:
        logger.warning("Error dispatching Telegram alert: %s", e)
        return False


async def test_telegram_alert(custom_token: Optional[str] = None, custom_chat_id: Optional[str] = None) -> tuple[bool, str]:
    """Sends a test ping to verify Telegram Bot credentials."""
    token = custom_token or get_telegram_config()[0]
    chat_id = custom_chat_id or get_telegram_config()[1]

    if not token or not chat_id:
        return False, "Bot Token or Chat ID is missing."

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    text = (
        "✅ *TradeDesk Telegram Integration Active!*\n\n"
        "Your Telegram alert connection is verified. You will receive instant notifications whenever a high-probability trade setup or killzone trigger occurs."
    )
    payload = {
        "chat_id": chat_id,
        "text": text,
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
