import "server-only";

const ENGINE_URL = process.env.ENGINE_URL || "http://127.0.0.1:8000";
const ENGINE_KEY = process.env.ENGINE_KEY || "change-me-long-random";

export interface SmcStructure {
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
  bos: {
    type: "none" | "bullish" | "bearish";
    level: number;
    broken: boolean;
    status: string;
  };
  choch: {
    type: "none" | "bullish" | "bearish";
    level: number;
    active: boolean;
    status: string;
  };
  swingHigh: number;
  swingLow: number;
  prevSwingHigh: number;
  prevSwingLow: number;
  structureDetail: string;
}

export interface SmcOrderBlocks {
  bullishOB: { top: number; bottom: number; status: string; label: string };
  bearishOB: { top: number; bottom: number; status: string; label: string };
  nearestBullishFVG: { top: number; bottom: number; mid: number; size: number; mitigated: boolean; label: string } | null;
  nearestBearishFVG: { top: number; bottom: number; mid: number; size: number; mitigated: boolean; label: string } | null;
  activeFVGCount: number;
  totalFVGCount: number;
}

export interface SmcLiquidity {
  bsl: { level: number; distance: number; label: string };
  ssl: { level: number; distance: number; label: string };
  sweep: { detected: boolean; type: string; desc: string };
  internalTarget: string;
}

export interface SmcPdArray {
  rangeHigh: number;
  rangeLow: number;
  equilibrium: number;
  currentPercent: number;
  zone: "DISCOUNT" | "PREMIUM" | "EQUILIBRIUM";
  bias: string;
  actionHint: string;
  oteLong: { top: number; bottom: number };
  oteShort: { top: number; bottom: number };
}

export interface SmcKillzone {
  sessionName: string;
  isKillzone: boolean;
  phase: string;
  detail: string;
  timeString: string;
  utcTime: string;
  nyTime: string;
}

export interface SmcRisk {
  balance: number;
  riskPct: number;
  riskUsd: number;
  slPoints: number;
  lotSize: number;
  longSetup: { entry: number; sl: number; tp1: number; tp2: number; rr1: number; rr2: number };
  shortSetup: { entry: number; sl: number; tp1: number; tp2: number; rr1: number; rr2: number };
  checklist: Array<{ name: string; passed: boolean; weight: number }>;
  confluenceScore: number;
}

export interface SmcAnalysisData {
  symbol: string;
  price: number;
  structure: SmcStructure;
  orderBlocks: SmcOrderBlocks;
  liquidity: SmcLiquidity;
  pdArray: SmcPdArray;
  killzone: SmcKillzone;
  risk: SmcRisk;
}

export interface NewsEvent {
  title: string;
  impact: string;
  timeString: string;
  minutesUntil: number;
  forecast: string;
  previous: string;
  isPast?: boolean;
}

export interface MacroData {
  news: {
    isNewsWindow: boolean;
    warning: string | null;
    nextEvent: NewsEvent | null;
    upcomingCount: number;
    events: NewsEvent[];
  };
  dxy: {
    price: number;
    change24h: number;
    bias: "bull" | "bear" | "neutral";
    goldImpact: string;
  };
  mtf: {
    alignment: string;
    score: number;
    tf15m: { tf: string; trend: string; status: string };
    tf1h: { tf: string; trend: string; status: string };
    tf4h: { tf: string; trend: string; status: string };
  };
}

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
    expired?: boolean;
    breakoutLevels?: {
      buyTrigger: number;
      sellTrigger: number;
      atr: number;
    };
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
    oosProfitFactor?: number;
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
  smc?: SmcAnalysisData;
  macro?: MacroData;
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
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch backtest for ${symbol}: ${res.statusText}`);
  }
  return res.json();
}

export interface SignalItem {
  id: number;
  symbol: string;
  strategy: string;
  side: string;
  entry: number;
  sl: number;
  tp: number;
  score: number;
  createdAt: number;
  status: "open" | "closed";
  closedAt: number | null;
  resultR: number | null;
}

export interface SignalsResponse {
  signals: SignalItem[];
  stats: {
    count: number;
    winRate: number;
    avgR: number;
    expectancy: number;
  };
}

export async function getSignals(symbol?: string, limit: number = 50): Promise<SignalsResponse> {
  const query = new URLSearchParams();
  if (symbol) query.set("symbol", symbol);
  query.set("limit", limit.toString());

  const res = await fetch(`${ENGINE_URL}/api/signals?${query.toString()}`, {
    headers: { "X-Engine-Key": ENGINE_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch signals: ${res.statusText}`);
  }
  return res.json();
}

export function getEngineStreamUrl(symbol: string, tf: string = "15m"): string {
  return `${ENGINE_URL}/api/stream?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`;
}

export function getEngineKey(): string {
  return ENGINE_KEY;
}

export interface SettingsData {
  balance: number;
  risk_pct: number;
  daily_limit_pct: number;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
}

export async function getSettings(): Promise<SettingsData> {
  const res = await fetch(`${ENGINE_URL}/api/settings`, {
    headers: { "X-Engine-Key": ENGINE_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch settings: ${res.statusText}`);
  }
  return res.json();
}

export async function updateSettings(body: Partial<SettingsData>): Promise<SettingsData> {
  const res = await fetch(`${ENGINE_URL}/api/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Engine-Key": ENGINE_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Failed to update settings: ${res.statusText}`);
  }
  return res.json();
}

export async function testTelegram(token?: string, chatId?: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${ENGINE_URL}/api/telegram/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Engine-Key": ENGINE_KEY,
    },
    body: JSON.stringify({ telegram_bot_token: token, telegram_chat_id: chatId }),
  });
  if (!res.ok) {
    return { ok: false, message: `Server error: ${res.statusText}` };
  }
  return res.json();
}

export interface JournalTrade {
  id: number;
  symbol: string;
  side: "BUY" | "SELL";
  entry: number;
  exit: number;
  sl: number;
  qty: number;
  openedAt: number;
  closedAt: number;
  pnlUsd: number;
  rMultiple: number;
  notes: string;
}

export interface JournalStats {
  trades: number;
  winRate: number;
  totalR: number;
  expectancy: number;
  todayPnlUsd: number;
  dailyLimitHit: boolean;
}

export async function getJournal(limit: number = 100): Promise<JournalTrade[]> {
  const res = await fetch(`${ENGINE_URL}/api/journal?limit=${limit}`, {
    headers: { "X-Engine-Key": ENGINE_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch journal: ${res.statusText}`);
  }
  return res.json();
}

export async function addJournalTrade(trade: {
  symbol: string;
  side: string;
  entry: number;
  exit: number;
  sl: number;
  qty: number;
  notes?: string;
}): Promise<{ ok: boolean; id: number }> {
  const res = await fetch(`${ENGINE_URL}/api/journal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Engine-Key": ENGINE_KEY,
    },
    body: JSON.stringify(trade),
  });
  if (!res.ok) {
    throw new Error(`Failed to add journal trade: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteJournalTrade(tradeId: number): Promise<{ ok: boolean }> {
  const res = await fetch(`${ENGINE_URL}/api/journal/${tradeId}`, {
    method: "DELETE",
    headers: { "X-Engine-Key": ENGINE_KEY },
  });
  if (!res.ok) {
    throw new Error(`Failed to delete journal trade: ${res.statusText}`);
  }
  return res.json();
}

export async function getJournalStats(): Promise<JournalStats> {
  const res = await fetch(`${ENGINE_URL}/api/journal/stats`, {
    headers: { "X-Engine-Key": ENGINE_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch journal stats: ${res.statusText}`);
  }
  return res.json();
}


