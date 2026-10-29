"use client";

import React, { useState, useEffect } from "react";
import { useLive } from "@/lib/use-live";
import SetupCard from "./SetupCard";
import Chart from "./Chart";
import ContextPanel from "./ContextPanel";
import LiquidityPanel from "./LiquidityPanel";
import StrategiesPanel from "./StrategiesPanel";
import SmcAnalysisDeck from "./smc/SmcAnalysisDeck";
import { Button } from "@/components/ui/button";
import type { SnapshotData } from "@/lib/engine";

interface DashboardViewProps {
  initialSymbol: string;
  initialSnapshot: SnapshotData;
  initialCandles: Array<[number, number, number, number, number, number]>;
}

export default function DashboardView({
  initialSymbol,
  initialSnapshot,
  initialCandles,
}: DashboardViewProps) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [activeTf, setActiveTf] = useState("15m");
  const [candles, setCandles] = useState(initialCandles);

  // Consume live SSE stream
  const { snapshot, connected, lastUpdate } = useLive({
    symbol,
    tf: activeTf,
    initialSnapshot,
  });

  // Calculate "updated Xs ago"
  const [secondsAgo, setSecondsAgo] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdate) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdate]);

  // When symbol or tf changes, fetch initial candles
  useEffect(() => {
    let cancelled = false;
    async function loadCandles() {
      try {
        const res = await fetch(`/api/candles?symbol=${symbol}&tf=${activeTf}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setCandles(data);
        }
      } catch (err) {
        console.error("Failed to load candles:", err);
      }
    }

    loadCandles();
    return () => {
      cancelled = true;
    };
  }, [symbol, activeTf]);

  const currentSnapshot = snapshot || initialSnapshot;
  const isFresh = connected && currentSnapshot.fresh;

  // Instant browser audio sound alert on new BUY / SELL setups
  const prevActionRef = React.useRef<string>("WAIT");
  useEffect(() => {
    const curAction = currentSnapshot.setup?.action || "WAIT";
    if (prevActionRef.current === "WAIT" && (curAction === "BUY" || curAction === "SELL")) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
          osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.55);
        }
      } catch {}
    }
    prevActionRef.current = curAction;
  }, [currentSnapshot.setup?.action]);

  return (
    <div className="space-y-6">
      {/* Top Bar Controls: Asset Switch & Live Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800/60">
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSymbol("XAUUSD")}
            className={`h-8 px-4 font-semibold text-xs rounded transition-colors ${
              symbol === "XAUUSD"
                ? "bg-zinc-100 text-zinc-900 shadow"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            }`}
          >
            Gold (XAU/USD) — Exness
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSymbol("BTCUSD")}
            className={`h-8 px-4 font-semibold text-xs rounded transition-colors ${
              symbol === "BTCUSD"
                ? "bg-zinc-100 text-zinc-900 shadow"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            }`}
          >
            Bitcoin (BTC/USD)
          </Button>
        </div>

        {/* Live dot & freshness */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-1.5 font-medium">
            <span
              className={`h-2 w-2 rounded-full ${
                isFresh
                  ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                  : "bg-red-500 animate-pulse"
              }`}
            />
            <span className={isFresh ? "text-zinc-300" : "text-red-400"}>
              {isFresh ? "Live Feed" : "Offline"}
            </span>
          </div>
          <span className="text-zinc-600 font-mono text-[11px]">
            updated {secondsAgo}s ago
          </span>
        </div>
      </div>

      {/* 1. Full-Width TradingView / Exness Chart */}
      <div className="w-full h-[520px] lg:h-[580px]">
        <Chart
          symbol={symbol}
          activeTf={activeTf}
          onTfChange={setActiveTf}
          candles={candles}
          liveCandle={currentSnapshot.candle}
          setup={currentSnapshot.setup}
          liquidity={currentSnapshot.liquidity}
        />
      </div>

      {/* 2. Setup Card & Analysis Deck Below Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Best Setup Now Card (Dominant left 5 cols) */}
        <div className="lg:col-span-5 w-full">
          <SetupCard
            setup={currentSnapshot.setup}
            symbol={symbol}
            price={currentSnapshot.price}
            dailyLimitHit={currentSnapshot.dailyLimitHit}
            liquidity={currentSnapshot.liquidity}
          />
        </div>

        {/* Supporting Context & Strategy Panels (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <ContextPanel
              regime={currentSnapshot.regime}
              bias={currentSnapshot.bias}
            />
            <StrategiesPanel strategies={currentSnapshot.strategies} />
          </div>
          <LiquidityPanel liquidity={currentSnapshot.liquidity} />
        </div>
      </div>

      {/* 3. Full Institutional ICT / SMC Real Market Analysis Deck */}
      <SmcAnalysisDeck
        smc={currentSnapshot.smc}
        symbol={symbol}
        price={currentSnapshot.price}
      />
    </div>
  );
}
