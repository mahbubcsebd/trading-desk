from typing import Optional
from pydantic import BaseModel, Field


class SettingsUpdate(BaseModel):
    balance: Optional[float] = Field(None, gt=0, description="Account balance in USD")
    risk_pct: Optional[float] = Field(None, gt=0, le=100, description="Risk per trade percentage")
    daily_limit_pct: Optional[float] = Field(None, gt=0, le=100, description="Daily loss limit percentage")
    telegram_bot_token: Optional[str] = Field(None, description="Telegram Bot Token")
    telegram_chat_id: Optional[str] = Field(None, description="Telegram Chat ID")


class JournalCreate(BaseModel):
    symbol: str = Field(..., description="Symbol, e.g. BTCUSD or XAUUSD")
    side: str = Field(..., description="BUY or SELL")
    entry: float = Field(..., gt=0, description="Entry price")
    exit: float = Field(..., gt=0, description="Exit price")
    sl: float = Field(..., gt=0, description="Stop loss price")
    qty: float = Field(..., gt=0, description="Quantity")
    opened_at: Optional[int] = Field(None, description="Opened timestamp ms")
    closed_at: Optional[int] = Field(None, description="Closed timestamp ms")
    notes: Optional[str] = Field("", description="Trade notes")
