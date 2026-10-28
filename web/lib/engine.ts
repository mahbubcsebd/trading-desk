import "server-only";

const ENGINE_URL = process.env.ENGINE_URL || "http://127.0.0.1:8000";
const ENGINE_KEY = process.env.ENGINE_KEY || "change-me-long-random";

export interface SnapshotData {
  symbol: string;
  ts: number;
  fresh: boolean;
  price: number;
  change24hPct: number;
  regime: {
    state: "trending" | "ranging";
    volatility: "low" | "normal" | "high";
    adx: number;
  };
  bias: {
    h4: "bull" | "bear" | "neutral";
    h1: "bull" | "bear" | "neutral";
  };
  setup: {
    action: "BUY" | "SELL" | "WAIT";
    score: number;
    strategy: string | null;
    entry: number;
    sl: number;
    tp: number;
    rr: number;
    qty: number;
    riskUsd: number;
    reasons: Array<{ label: string; points: number }>;
    waitReason: string | null;
    validUntil: number;
  };
  liquidity: {
    bookImbalance: number;
    buyWall: { price: number; usd: number } | null;
    sellWall: { price: number; usd: number } | null;
    takerBuyPct: number;
    oiChange15mPct: number;
    funding: number;
    liq5m: { longUsd: number; shortUsd: number };
  };
  strategies: Array<{
    id: "trend" | "reversion" | "sweep";
    state: "signal" | "idle" | "disabled";
    enabled: boolean;
  }>;
  candle: {
    tf: string;
    t: number;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  };
  dailyLimitHit: boolean;
}

export async function getHealth(): Promise<{ ok: boolean; feed: Record<string, string> }> {
  const res = await fetch(`${ENGINE_URL}/api/health`, {
    headers: { "X-Engine-Key": ENGINE_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Engine health check failed: ${res.statusText}`);
  }
  return res.json();
}

export async function getSnapshot(symbol: string, tf: string = "15m"): Promise<SnapshotData> {
  const res = await fetch(`${ENGINE_URL}/api/snapshot?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`, {
    headers: { "X-Engine-Key": ENGINE_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch snapshot for ${symbol}: ${res.statusText}`);
  }
  return res.json();
}

export async function getCandles(
  symbol: string,
  tf: string = "15m",
  limit: number = 500
): Promise<Array<[number, number, number, number, number, number]>> {
  const res = await fetch(
    `${ENGINE_URL}/api/candles?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}&limit=${limit}`,
    {
      headers: { "X-Engine-Key": ENGINE_KEY },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch candles for ${symbol}: ${res.statusText}`);
  }
  return res.json();
}

export interface BacktestResult {
  symbol: string;
  strategy: string;
  enabled: boolean;
  run_at: number;
  in_sample: {
    trades: number;
    win_rate: number;
    avg_r: number;
    expectancy: number;
    profit_factor: number;
    max_drawdown: number;
    total_r: number;
  };
  out_of_sample: {
    trades: number;
    win_rate: number;
    avg_r: number;
    expectancy: number;
    profit_factor: number;
    max_drawdown: number;
    total_r: number;
  };
}

export async function getBacktest(symbol: string): Promise<BacktestResult[]> {
  const res = await fetch(`${ENGINE_URL}/api/backtest?symbol=${encodeURIComponent(symbol)}`, {
    headers: { "X-Engine-Key": ENGINE_KEY },
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch backtest for ${symbol}: ${res.statusText}`);
  }
  return res.json();
}

export function getEngineStreamUrl(symbol: string, tf: string = "15m"): string {

  return `${ENGINE_URL}/api/stream?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`;
}

export function getEngineKey(): string {
  return ENGINE_KEY;
}
