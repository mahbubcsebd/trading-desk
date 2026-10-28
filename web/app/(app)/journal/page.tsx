import React, { Suspense } from "react";
import { getJournal, getJournalStats, type JournalTrade, type JournalStats } from "@/lib/engine";
import JournalClient from "@/components/JournalClient";

async function JournalData() {
  let trades: JournalTrade[] = [];
  let stats: JournalStats = {
    trades: 0,
    winRate: 0,
    totalR: 0,
    expectancy: 0,
    todayPnlUsd: 0,
    dailyLimitHit: false,
  };

  try {
    trades = await getJournal(100);
  } catch {
    trades = [];
  }

  try {
    stats = await getJournalStats();
  } catch {
    stats = {
      trades: 0,
      winRate: 0,
      totalR: 0,
      expectancy: 0,
      todayPnlUsd: 0,
      dailyLimitHit: false,
    };
  }

  return <JournalClient initialTrades={trades} initialStats={stats} />;
}

export default function JournalPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-100">
          Trading Performance & Journal
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Log trades, compute R-multiples, and track daily drawdown limits.
        </p>
      </div>

      <Suspense fallback={<div className="text-xs text-zinc-500 py-6">Loading journal data...</div>}>
        <JournalData />
      </Suspense>
    </div>
  );
}
