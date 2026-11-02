import React, { Suspense } from "react";
import { getBacktest, type BacktestResult } from "@/lib/engine";
import { connection } from "next/server";
import VisualBacktestDashboard from "@/components/VisualBacktestDashboard";

const ALL_SYMBOLS = ["XAUUSD", "BTCUSD", "EURUSD", "GBPUSD", "USDJPY", "US30", "NAS100"];

async function BacktestData() {
  await connection();
  const allResults: Record<string, BacktestResult[]> = {};

  await Promise.all(
    ALL_SYMBOLS.map(async (sym) => {
      try {
        allResults[sym] = await getBacktest(sym);
      } catch {
        allResults[sym] = [];
      }
    })
  );

  return <VisualBacktestDashboard initialSymbol="XAUUSD" initialResults={allResults} />;
}

export default function BacktestPage() {
  return (
    <div className="space-y-6">
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-12 text-xs text-zinc-500 font-mono">
            Calibrating Interactive Visual Backtest Simulator & Equity Curve...
          </div>
        }
      >
        <BacktestData />
      </Suspense>
    </div>
  );
}
