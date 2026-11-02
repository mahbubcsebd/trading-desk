"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Flame,
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock,
  Gauge,
  Layers,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PortfolioRiskShieldData } from "@/lib/engine";

interface PortfolioRiskShieldProps {
  onSelectSymbol?: (symbol: string) => void;
}

export default function PortfolioRiskShield({ onSelectSymbol }: PortfolioRiskShieldProps) {
  const [data, setData] = useState<PortfolioRiskShieldData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [selectedPairAdvice, setSelectedPairAdvice] = useState<string | null>(null);

  const fetchRiskShield = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch("/api/risk-shield");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load Portfolio Risk Shield:", err);
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRiskShield();
    const interval = setInterval(() => {
      fetchRiskShield();
    }, 15000); // 15s poll
    return () => clearInterval(interval);
  }, [fetchRiskShield]);

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-3 text-center text-xs text-zinc-400 backdrop-blur-md flex items-center justify-center gap-2">
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
        <span>Calculating live currency correlation matrix & drawdown circuit breaker...</span>
      </div>
    );
  }

  if (!data) return null;

  const cb = data.circuitBreaker;
  const heat = data.portfolioHeat;
  const net = data.netCurrencyExposure;
  const corr = data.correlation;
  const symbols = corr?.symbols || [];
  const matrix = corr?.matrix || {};
  const isTripped = cb.isTripped;

  // Cell color helper for correlation matrix
  const getCellBg = (val: number) => {
    if (val >= 0.70) return "bg-emerald-500/25 text-emerald-300 font-bold border-emerald-500/40";
    if (val >= 0.30) return "bg-emerald-500/10 text-emerald-400 font-medium";
    if (val <= -0.70) return "bg-rose-500/25 text-rose-300 font-bold border-rose-500/40";
    if (val <= -0.30) return "bg-amber-500/15 text-amber-300 font-medium";
    return "bg-zinc-900/60 text-zinc-400";
  };

  return (
    <div
      className={`rounded-xl border transition-all duration-300 shadow-xl backdrop-blur-md overflow-hidden ${
        isTripped
          ? "border-rose-500/80 bg-rose-950/30 shadow-[0_0_30px_rgba(244,63,94,0.3)] animate-pulse"
          : cb.isNearingBreaker
          ? "border-amber-500/60 bg-amber-950/20"
          : "border-zinc-800/80 bg-zinc-950/90"
      }`}
    >
      {/* 1. Header & Circuit Breaker Banner */}
      <div className="p-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-lg border shrink-0 ${
              isTripped
                ? "bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.5)]"
                : cb.isNearingBreaker
                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            }`}
          >
            {isTripped ? <Lock className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                Currency Correlation & Risk Shield
              </h3>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold tracking-wider uppercase ${
                  isTripped
                    ? "bg-rose-500 text-white"
                    : cb.isNearingBreaker
                    ? "bg-amber-500 text-zinc-950"
                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                {cb.badge}
              </span>
            </div>
            <p className="text-[11px] text-zinc-300 mt-0.5 font-sans">
              {cb.message}
            </p>
          </div>
        </div>

        {/* Quick Metrics & Actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono">
            {/* Drawdown consumed bar */}
            <div className="text-right">
              <span className="text-[10px] text-zinc-400 block">Daily Drawdown</span>
              <span
                className={`font-bold tabular-nums ${
                  isTripped ? "text-rose-400" : cb.isNearingBreaker ? "text-amber-400" : "text-emerald-400"
                }`}
              >
                ${cb.currentLossUsd.toFixed(2)} / ${cb.maxDailyLossUsd.toFixed(2)}
              </span>
            </div>

            {/* Committed Risk */}
            <div className="text-right hidden md:block pl-2 border-l border-zinc-800">
              <span className="text-[10px] text-zinc-400 block">Portfolio Heat</span>
              <span
                className={`font-bold tabular-nums ${
                  heat.status === "HIGH_RISK"
                    ? "text-rose-400"
                    : heat.status === "ELEVATED"
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                {heat.totalCommittedRiskPct}% / {heat.maxAllowedRiskPct}%
              </span>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchRiskShield(true)}
            disabled={refreshing}
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 cursor-pointer"
            title="Refresh Risk Shield"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-cyan-400" : ""}`} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 px-2 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/80 gap-1 cursor-pointer"
          >
            <span className="text-[11px] font-medium">{isExpanded ? "Hide Details" : "Inspect Matrix"}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* 2. Net Currency Exposure Badges Ribbon */}
      <div className="px-4 py-2 bg-zinc-900/40 border-b border-zinc-800/60 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
          <Gauge className="w-3.5 h-3.5 text-cyan-400" />
          <span>Net Currency Direction:</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(net).map(([curr, exp]) => {
            const isLong = exp > 0;
            const isShort = exp < 0;
            return (
              <span
                key={curr}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 ${
                  isLong
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : isShort
                    ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800"
                }`}
              >
                <span>{curr}:</span>
                <strong className={isLong ? "text-emerald-400" : isShort ? "text-rose-400" : "text-zinc-400"}>
                  {isLong ? `+${exp}x Long` : isShort ? `${exp}x Short` : "Flat"}
                </strong>
              </span>
            );
          })}
        </div>
      </div>

      {/* 3. Detailed Expandable Section (Warnings + 7x7 Correlation Heatmap) */}
      {isExpanded && (
        <div className="p-4 space-y-4 animate-in fade-in duration-300">
          {/* Concentration Warnings if any */}
          {data.warnings && data.warnings.length > 0 && (
            <div className="space-y-2">
              {data.warnings.map((w, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-rose-500/30 bg-rose-950/20 text-xs text-rose-200 flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-rose-300 uppercase tracking-wider text-[10px]">
                      {w.type.replace(/_/g, " ")}
                    </strong>
                    <p className="mt-0.5 text-zinc-300 font-sans leading-relaxed">{w.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Correlation Matrix Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Live 7x7 Multi-Asset Pearson Correlation Heatmap (1H Return Series)
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                +1.00 Max Positive • -1.00 Max Inverse
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-zinc-800/80 bg-zinc-900/30">
              <table className="w-full text-center border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/70 text-[10px] text-zinc-400 uppercase">
                    <th className="py-2 px-2 text-left">Asset</th>
                    {symbols.map((s) => (
                      <th key={s} className="py-2 px-2">
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {symbols.map((s1) => (
                    <tr key={s1} className="hover:bg-zinc-900/50">
                      <td className="py-2 px-2.5 font-bold text-zinc-200 text-left border-r border-zinc-800/60">
                        {s1}
                      </td>
                      {symbols.map((s2) => {
                        const val = matrix[s1]?.[s2] ?? 0.0;
                        const isSelf = s1 === s2;
                        return (
                          <td
                            key={s2}
                            onClick={() => {
                              if (!isSelf) {
                                setSelectedPairAdvice(
                                  `${s1} vs ${s2}: Correlation is ${val > 0 ? "+" : ""}${val.toFixed(2)}. ${
                                    val >= 0.70
                                      ? "Extreme duplicate correlation! Opening both in the same direction doubles your drawdown risk."
                                      : val <= -0.70
                                      ? "Strong inverse correlation! Trading in the same direction creates an accidental hedge."
                                      : "Independent asset price action. Safe to trade simultaneously."
                                  }`
                                );
                              }
                            }}
                            className={`py-2 px-2 cursor-pointer transition-colors ${
                              isSelf ? "text-zinc-600 bg-zinc-950/40" : getCellBg(val)
                            }`}
                            title={isSelf ? "Self" : `${s1} vs ${s2}: ${val}`}
                          >
                            {isSelf ? "1.00" : val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Click Advice Banner */}
            {selectedPairAdvice && (
              <div className="p-2.5 rounded-lg border border-cyan-500/30 bg-cyan-950/20 text-xs text-cyan-200 flex items-center justify-between">
                <span>{selectedPairAdvice}</span>
                <button
                  onClick={() => setSelectedPairAdvice(null)}
                  className="text-cyan-400 hover:text-cyan-200 ml-2 font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

