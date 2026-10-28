import numpy as np
import pandas as pd
from typing import Dict, Tuple, Any


def calc_ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def calc_sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period).mean()


def calc_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)

    # Wilder's smoothing via ewm(alpha=1/period)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False).mean()

    # Avoid division by zero
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    # Where loss is 0 and gain > 0, RSI is 100; where both are 0, RSI is 50
    fallback = pd.Series(np.where(avg_gain > 0, 100.0, 50.0), index=series.index)
    rsi = rsi.fillna(fallback)
    return rsi



def calc_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high = df["high"]
    low = df["low"]
    close_prev = df["close"].shift(1)

    tr1 = high - low
    tr2 = (high - close_prev).abs()
    tr3 = (low - close_prev).abs()

    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    # Wilder's smoothing
    atr = tr.ewm(alpha=1.0 / period, adjust=False).mean()
    return atr


def calc_adx(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high = df["high"]
    low = df["low"]

    up_move = high - high.shift(1)
    down_move = low.shift(1) - low

    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    atr = calc_atr(df, period)

    plus_dm_series = pd.Series(plus_dm, index=df.index).ewm(alpha=1.0 / period, adjust=False).mean()
    minus_dm_series = pd.Series(minus_dm, index=df.index).ewm(alpha=1.0 / period, adjust=False).mean()

    plus_di = 100.0 * (plus_dm_series / atr.replace(0, np.nan)).fillna(0.0)
    minus_di = 100.0 * (minus_dm_series / atr.replace(0, np.nan)).fillna(0.0)

    di_sum = plus_di + minus_di
    di_diff = (plus_di - minus_di).abs()

    dx = 100.0 * (di_diff / di_sum.replace(0, np.nan)).fillna(0.0)
    adx = dx.ewm(alpha=1.0 / period, adjust=False).mean().fillna(0.0)
    return adx


def calc_bollinger(
    series: pd.Series, period: int = 20, num_std: float = 2.0
) -> Tuple[pd.Series, pd.Series, pd.Series]:
    mid = series.rolling(window=period).mean()
    std = series.rolling(window=period).std()
    upper = mid + num_std * std
    lower = mid - num_std * std
    return upper, mid, lower


def calc_donchian(df: pd.DataFrame, period: int = 20) -> Tuple[pd.Series, pd.Series, pd.Series]:
    high = df["high"]
    low = df["low"]
    # Rolling max/min of the previous 20 bars (excluding current bar)
    high_prev = high.shift(1).rolling(window=period).max()
    low_prev = low.shift(1).rolling(window=period).min()
    mid = (high_prev + low_prev) / 2.0
    return high_prev, mid, low_prev


def calc_volume_sma(series: pd.Series, period: int = 20) -> pd.Series:
    return series.rolling(window=period).mean()


def compute_indicators(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Computes all standard indicators on the DataFrame.
    Caps calculation to the last 500 bars if larger.
    """
    if len(df) > 500:
        data = df.iloc[-500:].copy().reset_index(drop=True)
    else:
        data = df.copy().reset_index(drop=True)

    if len(data) < 20:
        # Not enough data for meaningful indicators
        return {}

    close = data["close"]
    volume = data["volume"]

    ema50 = calc_ema(close, 50) if len(data) >= 50 else pd.Series(index=data.index)
    ema200 = calc_ema(close, 200) if len(data) >= 200 else pd.Series(index=data.index)
    rsi14 = calc_rsi(close, 14)
    atr14 = calc_atr(data, 14)
    adx14 = calc_adx(data, 14)
    bb_upper, bb_mid, bb_lower = calc_bollinger(close, 20, 2.0)
    donchian_high, donchian_mid, donchian_low = calc_donchian(data, 20)
    vol_sma20 = calc_volume_sma(volume, 20)

    return {
        "df": data,
        "ema50": ema50,
        "ema200": ema200,
        "rsi14": rsi14,
        "atr14": atr14,
        "adx14": adx14,
        "bb_upper": bb_upper,
        "bb_mid": bb_mid,
        "bb_lower": bb_lower,
        "donchian_high": donchian_high,
        "donchian_mid": donchian_mid,
        "donchian_low": donchian_low,
        "vol_sma20": vol_sma20,
    }


# Alias for compatibility
calc_indicators = compute_indicators

