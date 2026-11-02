export interface SymbolConfig {
  id: string;
  name: string;
  category: "Metals" | "Forex" | "Indices" | "Crypto";
  broker: string;
  tvSymbol: string;
  decimals: number;
  icon?: string;
}

export const SUPPORTED_SYMBOLS: SymbolConfig[] = [
  {
    id: "XAUUSD",
    name: "Gold (XAU/USD)",
    category: "Metals",
    broker: "Exness",
    tvSymbol: "OANDA:XAUUSD",
    decimals: 2,
  },
  {
    id: "EURUSD",
    name: "EUR/USD",
    category: "Forex",
    broker: "Exness",
    tvSymbol: "FX:EURUSD",
    decimals: 5,
  },
  {
    id: "GBPUSD",
    name: "GBP/USD",
    category: "Forex",
    broker: "Exness",
    tvSymbol: "FX:GBPUSD",
    decimals: 5,
  },
  {
    id: "USDJPY",
    name: "USD/JPY",
    category: "Forex",
    broker: "Exness",
    tvSymbol: "FX:USDJPY",
    decimals: 3,
  },
  {
    id: "US30",
    name: "US30 (Wall St 30)",
    category: "Indices",
    broker: "Exness",
    tvSymbol: "TVC:DJI",
    decimals: 2,
  },
  {
    id: "NAS100",
    name: "NAS100 (US Tech 100)",
    category: "Indices",
    broker: "Exness",
    tvSymbol: "TVC:NDX",
    decimals: 2,
  },
  {
    id: "BTCUSD",
    name: "Bitcoin (BTC/USD)",
    category: "Crypto",
    broker: "Exness",
    tvSymbol: "BINANCE:BTCUSDT",
    decimals: 2,
  },
];

export function getSymbolConfig(symbol: string): SymbolConfig {
  const sym = (symbol || "").toUpperCase();
  const found = SUPPORTED_SYMBOLS.find((s) => s.id === sym);
  if (found) return found;

  // Fallbacks based on pattern
  if (sym.includes("EUR") || sym.includes("GBP") || sym.includes("AUD") || sym.includes("NZD")) {
    return { id: sym, name: sym, category: "Forex", broker: "Exness", tvSymbol: `FX:${sym}`, decimals: 5 };
  }
  if (sym.includes("JPY")) {
    return { id: sym, name: sym, category: "Forex", broker: "Exness", tvSymbol: `FX:${sym}`, decimals: 3 };
  }
  return { id: sym, name: sym, category: "Forex", broker: "Exness", tvSymbol: `OANDA:${sym}`, decimals: 2 };
}

export function formatSymbolPrice(price: number | undefined | null, symbol: string): string {
  if (typeof price !== "number" || isNaN(price)) return "--";
  const cfg = getSymbolConfig(symbol);
  return price.toFixed(cfg.decimals);
}

export function formatPriceWithUnit(price: number | undefined | null, symbol: string): string {
  if (typeof price !== "number" || isNaN(price)) return "--";
  const formatted = formatSymbolPrice(price, symbol);
  const cfg = getSymbolConfig(symbol);
  if (cfg.category === "Forex") {
    return formatted; // Clean pip quote e.g. 1.08520, 157.890
  }
  return `$${formatted}`; // Gold, BTC, Indices
}
