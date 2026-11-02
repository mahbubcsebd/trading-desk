"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Activity,
  ChevronDown,
  ChevronUp,
  Radio,
  ExternalLink,
  Flame,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NewsSpikeGuardData, UpcomingNewsEvent } from "@/lib/engine";

interface NewsSpikeGuardDeckProps {
  symbol: string;
  onSelectSymbol?: (symbol: string) => void;
}

export default function NewsSpikeGuardDeck({
  symbol,
  onSelectSymbol,
}: NewsSpikeGuardDeckProps) {
  const [data, setData] = useState<NewsSpikeGuardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  const fetchGuardData = async () => {
    try {
      const res = await fetch(`/api/spike-guard?symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) throw new Error("Failed to fetch spike guard status");
      const json: NewsSpikeGuardData = await res.json();
      setData(json);
      if (json.nextHighImpactEvent?.secondsUntil) {
        setSecondsRemaining(Math.max(0, json.nextHighImpactEvent.secondsUntil));
      } else {
        setSecondsRemaining(null);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load spike guard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuardData();
    const interval = setInterval(fetchGuardData, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [symbol]);

  // Client-side smooth second ticker
  useEffect(() => {
    if (secondsRemaining === null || secondsRemaining <= 0) return;
    const ticker = setInterval(() => {
      setSecondsRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(ticker);
  }, [secondsRemaining]);

  const formatCountdown = (totalSec: number | null) => {
    if (totalSec === null || totalSec <= 0) return "Active Now / Passed";
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, "0")}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 animate-spin text-zinc-500" />
          <span>Calibrating Red Folder News Spike Guard & Dynamic Spread Monitor...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return null;
  }

  const guard = data!;
  const spread = guard.spread;
  const isLocked = guard.isTradeLocked;
  const isBlackout = guard.guardStatus === "BLACKOUT_LOCKED";
  const isPreNews = guard.guardStatus === "PRE_NEWS_WARNING";
  const isCooling = guard.guardStatus === "COOLING_OFF";
  const isSpreadAlert = guard.guardStatus === "SPREAD_ALERT";

  const statusBadgeBg = isBlackout
    ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
    : isPreNews
    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
    : isCooling
    ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
    : isSpreadAlert
    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";

  return (
    <div
      className={`rounded-xl border transition-all duration-300 overflow-hidden ${
        isBlackout
          ? "border-rose-500/60 bg-gradient-to-r from-rose-950/40 via-zinc-950 to-zinc-950 shadow-lg shadow-rose-950/20"
          : isPreNews
          ? "border-amber-500/50 bg-gradient-to-r from-amber-950/30 via-zinc-950 to-zinc-950"
          : isSpreadAlert
          ? "border-amber-500/40 bg-zinc-950/90"
          : "border-zinc-800/80 bg-zinc-950/70"
      }`}
    >
      {/* 1. Header Bar: Compact Strip always visible */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:px-4">
        {/* Left: Indicator & Title */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            {isBlackout ? (
              <ShieldAlert className="w-5 h-5 text-rose-400 animate-pulse" />
            ) : isPreNews ? (
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            ) : isCooling ? (
              <Clock className="w-5 h-5 text-blue-400" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            )}
            <span
              className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                isBlackout
                  ? "bg-rose-500 animate-ping"
                  : isPreNews || isSpreadAlert
                  ? "bg-amber-400"
                  : "bg-emerald-400"
              }`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Spike Guard & Dynamic Spread
              </span>
              <Badge variant="outline" className={`text-[10px] font-mono px-2 py-0.5 uppercase ${statusBadgeBg}`}>
                {guard.badge}
              </Badge>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">
              {guard.warning || "Institutional spread & news clearance active for " + guard.symbol}
            </p>
          </div>
        </div>

        {/* Right: Live Spread Meter & Next Red Folder Countdown */}
        <div className="flex items-center gap-2 sm:gap-4 ml-auto">
          {/* Spread Pill */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
            <span className="text-[10px] font-mono uppercase text-zinc-400">Spread:</span>
            <span className="font-mono font-bold text-zinc-100">
              {spread.liveSpread} <span className="text-[10px] text-zinc-400">{guard.symbol.includes("USD") && !guard.symbol.includes("XAU") && !guard.symbol.includes("BTC") ? "pips" : ""}</span>
            </span>
            <Badge
              variant="outline"
              className={`text-[9px] font-mono px-1.5 py-0 uppercase ${
                spread.status === "OPTIMAL"
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : spread.status === "ELEVATED"
                  ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                  : "text-rose-400 border-rose-500/30 bg-rose-500/10"
              }`}
            >
              {spread.multiplier}x {spread.status}
            </Badge>
          </div>

          {/* Next High Impact Event Pill */}
          {guard.nextHighImpactEvent && (
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-zinc-400 truncate max-w-[140px] text-[11px]">
                {guard.nextHighImpactEvent.title}:
              </span>
              <span className="font-mono font-bold text-rose-300 text-[11px]">
                {formatCountdown(secondsRemaining)}
              </span>
            </div>
          )}

          {/* Toggle details */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          >
            {isExpanded ? (
              <span className="flex items-center gap-1 font-mono">
                Less <ChevronUp className="w-3.5 h-3.5" />
              </span>
            ) : (
              <span className="flex items-center gap-1 font-mono">
                Inspect <ChevronDown className="w-3.5 h-3.5" />
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* 2. Expanded Detail Pane */}
      {isExpanded && (
        <div className="p-4 pt-2 border-t border-zinc-800/80 bg-zinc-950/40 space-y-4 text-xs">
          {/* Mentorship Alert Banner in Bengali */}
          <div
            className={`p-3 rounded-lg border flex items-start gap-3 ${
              isBlackout
                ? "bg-rose-950/30 border-rose-500/40 text-rose-200"
                : isPreNews
                ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
                : isCooling
                ? "bg-blue-950/30 border-blue-500/40 text-blue-200"
                : "bg-emerald-950/20 border-emerald-500/30 text-emerald-200"
            }`}
          >
            <Radio className="w-4 h-4 mt-0.5 shrink-0 opacity-80" />
            <div className="space-y-0.5">
              <span className="font-bold text-[11px] uppercase tracking-wider block">
                Institutional Risk Advisor (Exness Broker Policy):
              </span>
              <p className="text-xs leading-relaxed text-zinc-300">{guard.guidanceBn}</p>
            </div>
          </div>

          {/* 3-Column Grid: Spread Gauge vs Next Red Folder vs Cross-Pair Radar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Column 1: Dynamic Live Spread Gauge */}
            <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                  <span className="font-bold text-zinc-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-zinc-400" />
                    Exness Spread Gauge ({guard.symbol})
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono text-zinc-400 border-zinc-700">
                    Typical: {spread.typicalSpread}
                  </Badge>
                </div>

                <div className="py-3 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-bold font-mono text-zinc-100">
                        {spread.liveSpread}
                      </span>
                      <span className="text-[10px] text-zinc-400 ml-1.5 uppercase">{spread.unit}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-mono text-zinc-400 block">Est. Cost / Lot:</span>
                      <span className="text-xs font-mono font-bold text-amber-300">
                        ${spread.costPerLotUsd.toFixed(2)} USD
                      </span>
                    </div>
                  </div>

                  {/* Progress Gauge */}
                  <div className="space-y-1">
                    <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden flex">
                      <div
                        className={`transition-all duration-500 rounded-full ${
                          spread.status === "OPTIMAL"
                            ? "bg-emerald-400"
                            : spread.status === "ELEVATED"
                            ? "bg-amber-400"
                            : "bg-rose-500"
                        }`}
                        style={{
                          width: `${Math.min(100, (spread.multiplier / 2.5) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-zinc-500">
                      <span>Tight (&le;1.2x)</span>
                      <span>Elevated (1.3-2.2x)</span>
                      <span>Blown (&gt;2.2x)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-400">
                <span>Bid: {spread.bid ?? "--"}</span>
                <span>Ask: {spread.ask ?? "--"}</span>
              </div>
            </div>

            {/* Column 2: Nearest High-Impact Catalyst */}
            <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                  <span className="font-bold text-zinc-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-rose-400" />
                    Upcoming Red Folder Catalyst
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono text-rose-400 border-rose-500/30 bg-rose-500/10">
                    High Impact
                  </Badge>
                </div>

                {guard.nextHighImpactEvent ? (
                  <div className="py-2.5 space-y-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-mono bg-zinc-800 text-zinc-200">
                          {guard.nextHighImpactEvent.currency}
                        </Badge>
                        <span className="font-bold text-xs text-zinc-100 truncate">
                          {guard.nextHighImpactEvent.title}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400 mt-1 block">
                        Scheduled at: {guard.nextHighImpactEvent.timeUtc}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80 text-center">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
                        Time Until Volatility Release:
                      </span>
                      <span className="text-xl font-bold font-mono text-rose-300 tracking-wider">
                        {formatCountdown(secondsRemaining)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1">
                      <div className="p-1.5 rounded bg-zinc-950/50 border border-zinc-800 text-center">
                        <span className="text-zinc-500 block">Forecast:</span>
                        <span className="text-zinc-200 font-bold">{guard.nextHighImpactEvent.forecast}</span>
                      </div>
                      <div className="p-1.5 rounded bg-zinc-950/50 border border-zinc-800 text-center">
                        <span className="text-zinc-500 block">Previous:</span>
                        <span className="text-zinc-200 font-bold">{guard.nextHighImpactEvent.previous}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-zinc-500 italic text-xs">
                    No upcoming High-Impact USD/pair releases scheduled within the next 24 hours.
                  </div>
                )}
              </div>

              <div className="text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/60 text-center">
                Automated No-Trade Lockout: -15m to +15m of release
              </div>
            </div>

            {/* Column 3: Cross-Pair Spread Radar */}
            <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                  <span className="font-bold text-zinc-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    All Instruments Spread Matrix
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono text-zinc-400 border-zinc-700">
                    7 Pairs
                  </Badge>
                </div>

                <div className="py-2 space-y-1.5">
                  {Object.entries(guard.allSymbolsSpread).map(([sym, sp]) => {
                    const isCurrent = sym === guard.symbol;
                    const isSpOptimal = sp.status === "OPTIMAL";
                    return (
                      <div
                        key={sym}
                        onClick={() => onSelectSymbol && onSelectSymbol(sym)}
                        className={`flex items-center justify-between p-1.5 px-2.5 rounded-lg cursor-pointer transition-all ${
                          isCurrent
                            ? "bg-zinc-800 border border-zinc-700 text-zinc-100 font-bold"
                            : "hover:bg-zinc-800/50 text-zinc-300 border border-transparent"
                        }`}
                      >
                        <span className="font-mono text-xs">{sym}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-zinc-300">
                            {sp.liveSpread}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                              isSpOptimal
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {sp.multiplier}x
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/60 text-center">
                Click any instrument to inspect chart & spread
              </div>
            </div>
          </div>

          {/* 4. Relevant Economic Timeline Table for current symbol */}
          {guard.upcomingEvents.length > 0 && (
            <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-300 uppercase tracking-wider text-[11px]">
                  Scheduled Macro Events for {guard.symbol} ({guard.currencies.join(", ")})
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  {guard.upcomingEvents.length} events today
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                {guard.upcomingEvents.slice(0, 6).map((ev, i) => {
                  const isHigh = ev.impact === "High";
                  return (
                    <div
                      key={i}
                      className={`p-2 rounded-lg border flex items-center justify-between ${
                        ev.isPast
                          ? "bg-zinc-950/30 border-zinc-850 opacity-50 text-zinc-400"
                          : isHigh
                          ? "bg-rose-950/20 border-rose-500/30 text-zinc-200"
                          : "bg-zinc-950/60 border-zinc-800 text-zinc-300"
                      }`}
                    >
                      <div className="space-y-0.5 truncate pr-2">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={`text-[8px] font-mono px-1 py-0 uppercase ${
                              isHigh
                                ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
                                : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                            }`}
                          >
                            {ev.currency} {ev.impact}
                          </Badge>
                          <span className="text-[11px] font-bold truncate">{ev.title}</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 block font-mono">
                          {ev.timeUtc} ({ev.minutesUntil > 0 ? `in ${ev.minutesUntil}m` : `${Math.abs(ev.minutesUntil)}m ago`})
                        </span>
                      </div>

                      <div className="text-right text-[10px] font-mono shrink-0">
                        <div className="text-zinc-400">F: <span className="text-zinc-200">{ev.forecast}</span></div>
                        <div className="text-zinc-500">P: <span className="text-zinc-400">{ev.previous}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
