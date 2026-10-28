import React, { Suspense } from "react";
import DashboardView from "@/components/DashboardView";
import { Skeleton } from "@/components/ui/skeleton";
import { getSnapshot, getCandles, type SnapshotData } from "@/lib/engine";
import { connection } from "next/server";

async function DashboardDataLoader() {
  await connection();
  const initialSymbol = "XAUUSDT";
  let snapshot: SnapshotData;
  let candles: Array<[number, number, number, number, number, number]> = [];

  try {
    snapshot = await getSnapshot(initialSymbol, "15m");
  } catch {
    snapshot = {
      symbol: initialSymbol,
      ts: Date.now(),
      fresh: false,
      price: 0,
      change24hPct: 0,
      regime: { state: "ranging", volatility: "normal", adx: 0 },
      bias: { h4: "neutral", h1: "neutral" },
      setup: {
        action: "WAIT",
        score: 0,
        strategy: null,
        entry: 0,
        sl: 0,
        tp: 0,
        rr: 0,
        qty: 0,
        riskUsd: 0,
        reasons: [],
        waitReason: "Engine offline or initializing",
        validUntil: 0,
      },
      liquidity: {
        bookImbalance: 0,
        buyWall: null,
        sellWall: null,
        takerBuyPct: 50,
        oiChange15mPct: 0,
        funding: 0,
        liq5m: { longUsd: 0, shortUsd: 0 },
      },
      strategies: [
        { id: "trend", state: "idle", enabled: false },
        { id: "reversion", state: "idle", enabled: false },
        { id: "sweep", state: "idle", enabled: false },
      ],
      candle: { tf: "15m", t: Date.now(), o: 0, h: 0, l: 0, c: 0, v: 0 },
      dailyLimitHit: false,
    };
  }

  try {
    candles = await getCandles(initialSymbol, "15m", 500);
  } catch {
    candles = [];
  }

  return (
    <DashboardView
      initialSymbol={initialSymbol}
      initialSnapshot={snapshot}
      initialCandles={candles}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-2 border-b border-zinc-800/60">
        <Skeleton className="h-8 w-48 bg-zinc-900" />
        <Skeleton className="h-5 w-28 bg-zinc-900" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4">
          <Skeleton className="h-[300px] w-full rounded-xl bg-zinc-900" />
        </div>
        <div className="lg:col-span-8">
          <Skeleton className="h-[460px] w-full rounded-xl bg-zinc-900" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Skeleton className="h-36 w-full rounded-xl bg-zinc-900" />
        <Skeleton className="h-36 w-full rounded-xl bg-zinc-900" />
        <Skeleton className="h-36 w-full rounded-xl bg-zinc-900" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardDataLoader />
    </Suspense>
  );
}
