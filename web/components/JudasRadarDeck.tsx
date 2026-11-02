"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Radio,
  Flame,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Zap,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Clock,
  Compass,
  ArrowRight,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import FastOrderModal from "./FastOrderModal";
import type { JudasRadarResult, SmcAnalysisData } from "@/lib/engine";

interface JudasRadarDeckProps {
  symbol: string;
  onSelectSymbol?: (symbol: string) => void;
  smc?: SmcAnalysisData | null;
}

export default function JudasRadarDeck({
  symbol,
  onSelectSymbol,
  smc,
}: JudasRadarDeckProps) {
  const [radar, setRadar] = useState<JudasRadarResult | null>(null);
  const [allRadars, setAllRadars] = useState<JudasRadarResult[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchRadarData = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      // 1. Fetch active symbol radar
      const res = await fetch(`/api/judas-radar?symbol=${encodeURIComponent(symbol)}`);
      if (res.ok) {
        const json = await res.json();
        setRadar(json);
      }
      // 2. Fetch all pairs radar for the multi-market scanner pills
      const resAll = await fetch(`/api/judas-radar?all=true`);
      if (resAll.ok) {
        const jsonAll = await resAll.json();
        setAllRadars(jsonAll);
      }
    } catch (err) {
      console.error("Failed to load Judas radar data:", err);
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchRadarData();
    const interval = setInterval(() => {
      fetchRadarData();
    }, 10000); // 10s poll
    return () => clearInterval(interval);
  }, [fetchRadarData]);

  if (loading && !radar) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-6 text-center text-xs text-zinc-400 backdrop-blur-md flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
        <span>Scanning Asian Session Boundaries & Judas Swing Liquidity Sweeps...</span>
      </div>
    );
  }

  if (!radar) return null;

  const asian = radar.asianRange;
  const london = radar.londonRange;
  const sweep = radar.sweepAnalysis;
  const setup = radar.tradeSetup;
  const isConfirmed = sweep.judasState.includes("CONFIRMED");
  const isSweeping = sweep.judasState.includes("SWEEPING");

  // Format price helper
  const pFmt = (val: number) => val.toFixed(radar.decimals);

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 shadow-2xl backdrop-blur-md overflow-hidden space-y-3 p-4">
      {/* 1. Header Bar with Multi-Pair Sweep Tracker */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-lg border shrink-0 ${
              isConfirmed
                ? "bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.4)]"
                : isSweeping
                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
            }`}
          >
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                ICT Asian Range & Judas Swing Radar
              </h3>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono">
                {symbol}
              </span>
            </div>
            <p className="text-[10px] text-zinc-400">
              Institutional Session Liquidity Sweep & Turtle Soup Reversal Engine
            </p>
          </div>
        </div>

        {/* Global Multi-Pair Sweep Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {allRadars.map((r) => {
            const hasConfirmed = r.sweepAnalysis.judasState.includes("CONFIRMED");
            const hasSweep = r.sweepAnalysis.judasState.includes("SWEEPING");
            const isActive = r.symbol === symbol;

            return (
              <button
                key={r.symbol}
                onClick={() => onSelectSymbol && onSelectSymbol(r.symbol)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all cursor-pointer flex items-center gap-1 ${
                  isActive
                    ? "bg-zinc-100 text-zinc-900 font-bold shadow-sm"
                    : hasConfirmed
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/50 animate-pulse"
                    : hasSweep
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
                title={`Switch to ${r.symbol}`}
              >
                <span>{r.symbol}</span>
                {hasConfirmed && <Flame className="w-2.5 h-2.5 text-rose-400 fill-current" />}
              </button>
            );
          })}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchRadarData(true)}
            disabled={refreshing}
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 cursor-pointer ml-1"
            title="Refresh Radar"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin text-cyan-400" : ""}`} />
          </Button>
        </div>
      </div>

      {/* 2. Confirmed Judas Swing Trade Banner (When triggered) */}
      {setup && (
        <div
          className={`p-3.5 rounded-xl border backdrop-blur-xl animate-in fade-in duration-300 ${
            setup.action === "BUY"
              ? "bg-emerald-950/40 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              : "bg-rose-950/40 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.2)]"
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div
                className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                  setup.action === "BUY"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                }`}
              >
                <Zap className="w-4 h-4 fill-current" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded font-black text-[10px] tracking-wider uppercase ${
                      setup.action === "BUY"
                        ? "bg-emerald-500 text-zinc-950"
                        : "bg-rose-500 text-white"
                    }`}
                  >
                    INSTITUTIONAL {setup.action} JUDAS SETUP
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Score: {setup.confidenceScore}/100 • 1:{setup.rr} R:R
                  </span>
                </div>
                <p className="text-xs text-zinc-200 leading-relaxed font-sans">
                  {setup.rationale}
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-mono">
                  <span className="text-zinc-400">
                    Entry: <strong className="text-zinc-100">{pFmt(setup.entry)}</strong>
                  </span>
                  <span className="text-zinc-400">
                    Stop Loss: <strong className="text-rose-400">{pFmt(setup.sl)}</strong>
                  </span>
                  <span className="text-zinc-400">
                    Target: <strong className="text-emerald-400">{pFmt(setup.tp)}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="shrink-0 self-end md:self-center">
              <FastOrderModal
                symbol={symbol}
                price={radar.price}
                setup={{
                  action: setup.action,
                  entry: setup.entry,
                  sl: setup.sl,
                  tp: setup.tp,
                  rr: setup.rr,
                  score: setup.confidenceScore,
                  strategy: "JUDAS_SWING_REVERSAL",
                  qty: 0.01,
                  riskUsd: 10,
                  reasons: [{ label: setup.trigger, points: setup.confidenceScore }],
                  waitReason: null,
                  validUntil: Date.now() + 3600000,
                }}
                smc={smc}
                triggerButton={
                  <Button
                    size="sm"
                    className={`h-8 px-3 text-xs font-bold gap-1.5 cursor-pointer shadow-lg ${
                      setup.action === "BUY"
                        ? "bg-emerald-600 hover:bg-emerald-500 text-zinc-950"
                        : "bg-rose-600 hover:bg-rose-500 text-white"
                    }`}
                  >
                    <span>Execute MT5 Ticket</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. Asian Range vs London Range Session Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Asian Range Box */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs font-bold text-zinc-200">Asian Session Range</span>
              <span className="text-[10px] text-zinc-500 font-mono">(00:00 - 08:00 UTC)</span>
            </div>
            <span
              className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-semibold ${
                asian.status === "DEVELOPING"
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                  : "bg-zinc-800 text-zinc-300"
              }`}
            >
              {asian.status}
            </span>
          </div>

          {/* Asian Levels Grid */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded bg-zinc-950/60 border border-zinc-800">
              <span className="text-[9px] text-zinc-500 block uppercase font-mono">Asian High (BSL)</span>
              <span className="text-xs font-bold text-rose-400 font-mono">{pFmt(asian.high)}</span>
              <span className="text-[9px] text-zinc-400 block font-mono">
                {radar.price > asian.high
                  ? `+${sweep.sweepHighPips}p SWEPT`
                  : `${((asian.high - radar.price) / radar.pipSize).toFixed(1)}p away`}
              </span>
            </div>

            <div className="p-2 rounded bg-zinc-950/60 border border-zinc-800">
              <span className="text-[9px] text-zinc-500 block uppercase font-mono">Asian Mid (50%)</span>
              <span className="text-xs font-bold text-zinc-200 font-mono">{pFmt(asian.midpoint)}</span>
              <span className="text-[9px] text-cyan-400 block font-mono">Equilibrium</span>
            </div>

            <div className="p-2 rounded bg-zinc-950/60 border border-zinc-800">
              <span className="text-[9px] text-zinc-500 block uppercase font-mono">Asian Low (SSL)</span>
              <span className="text-xs font-bold text-emerald-400 font-mono">{pFmt(asian.low)}</span>
              <span className="text-[9px] text-zinc-400 block font-mono">
                {radar.price < asian.low
                  ? `-${sweep.sweepLowPips}p SWEPT`
                  : `${((radar.price - asian.low) / radar.pipSize).toFixed(1)}p away`}
              </span>
            </div>
          </div>

          {/* Range Position Visual Gauge */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
              <span>Asian Width: <strong className="text-zinc-200">{asian.rangePips} pips</strong></span>
              <span>
                Position:{" "}
                <strong
                  className={
                    (asian.positionPct || 0) > 100
                      ? "text-rose-400"
                      : (asian.positionPct || 0) < 0
                      ? "text-emerald-400"
                      : "text-zinc-200"
                  }
                >
                  {(asian.positionPct || 0) > 100
                    ? "Outside Above (Swept)"
                    : (asian.positionPct || 0) < 0
                    ? "Outside Below (Swept)"
                    : `${asian.positionPct}% Range`}
                </strong>
              </span>
            </div>

            {/* Gauge bar */}
            <div className="relative h-2 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
              <div
                className="absolute top-0 bottom-0 bg-gradient-to-r from-emerald-500 via-cyan-500 to-rose-500 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(5, asian.positionPct || 50))}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* London Session Range Box */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-bold text-zinc-200">London Session Expansion</span>
              <span className="text-[10px] text-zinc-500 font-mono">(07:00 - 13:00 UTC)</span>
            </div>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono font-semibold">
              {london.status}
            </span>
          </div>

          {/* London Levels Grid */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded bg-zinc-950/60 border border-zinc-800">
              <span className="text-[9px] text-zinc-500 block uppercase font-mono">London High</span>
              <span className="text-xs font-bold text-rose-300 font-mono">{pFmt(london.high)}</span>
              <span className="text-[9px] text-zinc-500 block font-mono">Resistance</span>
            </div>

            <div className="p-2 rounded bg-zinc-950/60 border border-zinc-800">
              <span className="text-[9px] text-zinc-500 block uppercase font-mono">London Mid</span>
              <span className="text-xs font-bold text-zinc-200 font-mono">{pFmt(london.midpoint)}</span>
              <span className="text-[9px] text-amber-400 block font-mono">Midpoint</span>
            </div>

            <div className="p-2 rounded bg-zinc-950/60 border border-zinc-800">
              <span className="text-[9px] text-zinc-500 block uppercase font-mono">London Low</span>
              <span className="text-xs font-bold text-emerald-300 font-mono">{pFmt(london.low)}</span>
              <span className="text-[9px] text-zinc-500 block font-mono">Support</span>
            </div>
          </div>

          {/* Sweep Condition Badge */}
          <div className="p-2 rounded bg-zinc-950/80 border border-zinc-800 flex items-center justify-between text-xs">
            <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-mono">
              <Flame className="w-3 h-3 text-amber-400" />
              Judas Sweep State:
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                sweep.badgeColor === "rose"
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                  : sweep.badgeColor === "emerald"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : sweep.badgeColor === "amber"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : sweep.badgeColor === "cyan"
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {sweep.badgeLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
