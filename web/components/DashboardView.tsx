"use client";

import React, { useState, useEffect } from "react";
import { useLive } from "@/lib/use-live";
import SetupCard from "./SetupCard";
import Chart from "./Chart";
import ContextPanel from "./ContextPanel";
import LiquidityPanel from "./LiquidityPanel";
import StrategiesPanel from "./StrategiesPanel";
import SmcAnalysisDeck from "./smc/SmcAnalysisDeck";
import MacroNewsPanel from "./MacroNewsPanel";
import SessionHudBar from "./SessionHudBar";
import ConfluenceMatrix from "./ConfluenceMatrix";
import PortfolioRiskShield from "./PortfolioRiskShield";
import NewsSpikeGuardDeck from "./NewsSpikeGuardDeck";
import JudasRadarDeck from "./JudasRadarDeck";
import FastOrderModal from "./FastOrderModal";
import SoundAlertsDialog from "./SoundAlertsDialog";
import AiCopilot from "./AiCopilot";
import { Button } from "@/components/ui/button";
import { X, Bell, Zap, Flame, ShieldAlert, ArrowRight } from "lucide-react";
import {
  playSetupAlert,
  playLiquiditySweepAlert,
  playNewsWarningAlert,
  sendDesktopNotification,
} from "@/lib/audio-alerts";
import type { SnapshotData } from "@/lib/engine";
import { SUPPORTED_SYMBOLS } from "@/lib/formatters";

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

  // Multi-Event Sound Alerts & Desktop Notifications
  const [floatingAlert, setFloatingAlert] = useState<{
    type: "setup" | "sweep" | "news";
    title: string;
    desc: string;
    side?: "BUY" | "SELL";
    timestamp: number;
  } | null>(null);

  const prevActionRef = React.useRef<string>("WAIT");
  const prevSweepRef = React.useRef<boolean>(false);
  const prevNewsWindowRef = React.useRef<boolean>(false);

  useEffect(() => {
    // 1. Setup Signal Alert (BUY / SELL)
    const curAction = currentSnapshot.setup?.action || "WAIT";
    if (prevActionRef.current === "WAIT" && (curAction === "BUY" || curAction === "SELL")) {
      playSetupAlert(curAction as "BUY" | "SELL");
      sendDesktopNotification(
        `🟢 ${symbol} ${curAction} Signal Triggered!`,
        `Entry: $${currentSnapshot.setup?.entry || 0} | SL: $${currentSnapshot.setup?.sl || 0} | TP: $${currentSnapshot.setup?.tp || 0}`
      );
      setFloatingAlert({
        type: "setup",
        title: `${symbol} ${curAction} Signal Triggered!`,
        desc: `Entry: $${currentSnapshot.setup?.entry} | SL: $${currentSnapshot.setup?.sl} | TP: $${currentSnapshot.setup?.tp} (Score: ${currentSnapshot.setup?.score}/100)`,
        side: curAction as "BUY" | "SELL",
        timestamp: Date.now(),
      });
    }
    prevActionRef.current = curAction;

    // 2. SMC Liquidity Sweep (Judas Swing) Alert
    const sweepDetected = currentSnapshot.smc?.liquidity?.sweep?.detected || false;
    if (!prevSweepRef.current && sweepDetected) {
      playLiquiditySweepAlert();
      const sweepDesc = currentSnapshot.smc?.liquidity?.sweep?.desc || "Institutional Liquidity Pool Swept";
      sendDesktopNotification(`🎯 ${symbol} Liquidity Sweep!`, sweepDesc);
      setFloatingAlert({
        type: "sweep",
        title: `🎯 ${symbol} Liquidity Sweep Detected!`,
        desc: sweepDesc,
        timestamp: Date.now(),
      });
    }
    prevSweepRef.current = sweepDetected;

    // 3. Forex Factory High-Impact News Window Alert
    const isNewsWin = currentSnapshot.macro?.news?.isNewsWindow || false;
    if (!prevNewsWindowRef.current && isNewsWin) {
      playNewsWarningAlert();
      sendDesktopNotification(
        `⚠️ Forex Factory News Warning!`,
        currentSnapshot.macro?.news?.warning || "High spread widening volatility window active."
      );
      setFloatingAlert({
        type: "news",
        title: "⚠️ High Volatility News Window Active!",
        desc: currentSnapshot.macro?.news?.warning || "Spreads widening risk during red-folder economic events.",
        timestamp: Date.now(),
      });
    }
    prevNewsWindowRef.current = isNewsWin;
  }, [
    currentSnapshot.setup?.action,
    currentSnapshot.smc?.liquidity?.sweep?.detected,
    currentSnapshot.macro?.news?.isNewsWindow,
    symbol,
  ]);

  // Auto-dismiss floating alert after 9 seconds
  useEffect(() => {
    if (!floatingAlert) return;
    const timer = setTimeout(() => {
      setFloatingAlert(null);
    }, 9000);
    return () => clearTimeout(timer);
  }, [floatingAlert]);

  return (
    <div className="space-y-6">
      {/* Floating Institutional Real-Time Signal Banner */}
      {floatingAlert && (
        <div className="fixed top-16 right-4 sm:right-6 z-50 max-w-sm w-full p-3.5 rounded-xl bg-zinc-950/95 border border-zinc-700/80 shadow-[0_0_30px_rgba(0,0,0,0.85)] backdrop-blur-2xl animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div
                className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                  floatingAlert.type === "setup"
                    ? floatingAlert.side === "BUY"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                      : "bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.3)]"
                    : floatingAlert.type === "sweep"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-red-500/20 text-red-400 border border-red-500/30"
                }`}
              >
                {floatingAlert.type === "setup" ? (
                  <Zap className="w-4 h-4 fill-current" />
                ) : floatingAlert.type === "sweep" ? (
                  <Flame className="w-4 h-4" />
                ) : (
                  <ShieldAlert className="w-4 h-4" />
                )}
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                  {floatingAlert.title}
                </h4>
                <p className="text-[11px] text-zinc-300 leading-relaxed font-mono">
                  {floatingAlert.desc}
                </p>
                {floatingAlert.type === "setup" && (
                  <div className="pt-1.5">
                    <FastOrderModal
                      symbol={symbol}
                      price={currentSnapshot.price}
                      setup={currentSnapshot.setup}
                      smc={currentSnapshot.smc}
                      triggerButton={
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[10px] font-semibold bg-cyan-600 hover:bg-cyan-500 text-white gap-1 cursor-pointer"
                        >
                          <span>Open MT5 Ticket</span>
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      }
                    />
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setFloatingAlert(null)}
              className="text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 0. Live Institutional Session Architecture, Killzone & Macro News HUD Bar */}
      <SessionHudBar macro={currentSnapshot.macro} smc={currentSnapshot.smc} />

      {/* 0.5 Institutional Multi-Timeframe Confluence Matrix */}
      <ConfluenceMatrix
        activeSymbol={symbol}
        onSelectSymbol={(newSym) => setSymbol(newSym)}
      />

      {/* 0.6 Currency Correlation & Portfolio Risk Shield */}
      <PortfolioRiskShield
        onSelectSymbol={(newSym) => setSymbol(newSym)}
      />

      {/* 0.7 Red Folder News Spike Guard & Dynamic Spread Monitor */}
      <NewsSpikeGuardDeck
        symbol={symbol}
        onSelectSymbol={(newSym) => setSymbol(newSym)}
      />

      {/* Top Bar Controls: Asset Switch & Live Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800/60">
        <div className="flex flex-wrap items-center gap-1.5">
          {SUPPORTED_SYMBOLS.map((s) => (
            <Button
              key={s.id}
              variant="ghost"
              size="sm"
              onClick={() => setSymbol(s.id)}
              className={`h-8 px-3 font-semibold text-xs rounded-md transition-all ${
                symbol === s.id
                  ? "bg-zinc-100 text-zinc-900 shadow-sm font-bold"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80"
              }`}
            >
              <span>{s.name}</span>
              {s.category === "Forex" && (
                <span
                  className={`ml-1.5 text-[9px] px-1 py-0.2 rounded font-mono font-normal ${
                    symbol === s.id ? "bg-zinc-300 text-zinc-900" : "bg-zinc-800 text-cyan-400"
                  }`}
                >
                  FX
                </span>
              )}
              {s.category === "Indices" && (
                <span
                  className={`ml-1.5 text-[9px] px-1 py-0.2 rounded font-mono font-normal ${
                    symbol === s.id ? "bg-zinc-300 text-zinc-900" : "bg-zinc-800 text-amber-400"
                  }`}
                >
                  IDX
                </span>
              )}
            </Button>
          ))}

          {/* Quick Jump Shortcuts & Sound Customizer */}
          <div className="hidden sm:flex items-center space-x-1.5 pl-2 border-l border-zinc-800/80">
            <a
              href="#macro-radar"
              className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-zinc-900/90 hover:bg-zinc-800 text-rose-300 hover:text-rose-200 border border-rose-500/20 transition-all flex items-center space-x-1"
            >
              <span>📰 News & DXY Radar</span>
            </a>
            <a
              href="#smc-deck"
              className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-zinc-900/90 hover:bg-zinc-800 text-cyan-300 hover:text-cyan-200 border border-cyan-500/20 transition-all flex items-center space-x-1"
            >
              <span>🏛️ SMC Deck (6 Cards)</span>
            </a>
            <SoundAlertsDialog />
          </div>
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
          smc={currentSnapshot.smc}
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
            smc={currentSnapshot.smc}
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

      {/* 3. Macro Economic News Radar, DXY Correlation & Multi-Timeframe Alignment */}
      <div id="macro-radar" className="scroll-mt-16">
        <MacroNewsPanel
          macro={currentSnapshot.macro}
          symbol={symbol}
        />
      </div>

      {/* 3.5 ICT Asian Range & Judas Swing Radar */}
      <div id="judas-radar" className="scroll-mt-16">
        <JudasRadarDeck
          symbol={symbol}
          onSelectSymbol={(newSym) => setSymbol(newSym)}
          smc={currentSnapshot.smc}
        />
      </div>

      {/* 4. Full Institutional ICT / SMC Real Market Analysis Deck */}
      <div id="smc-deck" className="scroll-mt-16">
        <SmcAnalysisDeck
          smc={currentSnapshot.smc}
          symbol={symbol}
          price={currentSnapshot.price}
        />
      </div>

      {/* 5. Real-Time TradeDesk AI Copilot & Market Mentor */}
      <AiCopilot symbol={symbol} />
    </div>
  );
}
