"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConfluenceMatrixData, MatrixPairResult } from "@/lib/engine";

interface ConfluenceMatrixProps {
  activeSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export default function ConfluenceMatrix({
  activeSymbol,
  onSelectSymbol,
}: ConfluenceMatrixProps) {
  const [data, setData] = useState<ConfluenceMatrixData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());

  const fetchMatrix = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      const res = await fetch("/api/matrix");
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefreshed(Date.now());
      }
    } catch (err) {
      console.error("Failed to load confluence matrix:", err);
    } finally {
      setLoading(false);
      if (manual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMatrix();
    const interval = setInterval(() => {
      fetchMatrix();
    }, 12000); // Poll every 12 seconds
    return () => clearInterval(interval);
  }, [fetchMatrix]);

  const summary = data?.summary;
  const pairs = data?.pairs || [];

  const getTrendBadge = (trend: "BULLISH" | "BEARISH" | "NEUTRAL", rsi?: number) => {
    if (trend === "BULLISH") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <TrendingUp className="w-2.5 h-2.5" />
          <span>BULL</span>
          {rsi !== undefined && <span className="opacity-75 font-mono">({Math.round(rsi)})</span>}
        </span>
      );
    }
    if (trend === "BEARISH") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
          <TrendingDown className="w-2.5 h-2.5" />
          <span>BEAR</span>
          {rsi !== undefined && <span className="opacity-75 font-mono">({Math.round(rsi)})</span>}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/60">
        <Minus className="w-2.5 h-2.5" />
        <span>FLAT</span>
        {rsi !== undefined && <span className="opacity-75 font-mono">({Math.round(rsi)})</span>}
      </span>
    );
  };

  const getGradeBadge = (pair: MatrixPairResult) => {
    const { grade, bullCount, bearCount } = pair.alignment;
    if (grade === "A+") {
      return (
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded font-black text-[10px] bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.35)] flex items-center gap-1 animate-pulse">
            <Zap className="w-2.5 h-2.5 fill-current" />
            A+ ALIGN
          </span>
          <span className="text-[10px] text-emerald-400 font-mono font-bold">4/4</span>
        </div>
      );
    }
    if (grade === "A") {
      return (
        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" />
            A ALIGN
          </span>
          <span className="text-[10px] text-cyan-400 font-mono">3/4</span>
        </div>
      );
    }
    if (grade === "CHOP") {
      return (
        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" />
            DIVERGENT
          </span>
          <span className="text-[10px] text-amber-400 font-mono">2v2</span>
        </div>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded font-medium text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700/60">
        RANGING
      </span>
    );
  };

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 shadow-xl backdrop-blur-md overflow-hidden">
      {/* Header Bar */}
      <div className="px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                Multi-Timeframe Confluence Matrix
              </h3>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800/90 text-zinc-400 font-mono">
                4H • 1H • 15m • 5m
              </span>
            </div>
            <p className="text-[10px] text-zinc-400">
              Institutional orderflow alignment scanner across 7 multi-asset instruments
            </p>
          </div>
        </div>

        {/* Aggregate Stats Badges */}
        <div className="flex items-center gap-2">
          {summary && (
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono">
              <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-bold">
                {summary.aPlusCount} A+ Align
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
                {summary.aCount} A Bias
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/30 text-amber-400">
                {summary.chopCount} Divergent
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold uppercase tracking-wider text-[9px]">
                {summary.marketSentiment}
              </span>
            </div>
          )}

          {/* Action buttons */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchMatrix(true)}
            disabled={isRefreshing}
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 cursor-pointer"
            title="Refresh Matrix"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 gap-1 cursor-pointer"
          >
            <span className="text-[11px] font-medium">{isExpanded ? "Collapse" : "Expand"}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Matrix Table */}
      {isExpanded && (
        <div className="overflow-x-auto">
          {loading && !data ? (
            <div className="p-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Scanning institutional market structure across timeframes...</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-900/30 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                  <th className="py-2 px-3">Instrument</th>
                  <th className="py-2 px-3">Price</th>
                  <th className="py-2 px-3">4H Macro</th>
                  <th className="py-2 px-3">1H Bias</th>
                  <th className="py-2 px-3">15m Structure</th>
                  <th className="py-2 px-3">5m Momentum</th>
                  <th className="py-2 px-3">Confluence</th>
                  <th className="py-2 px-3">Setup Trigger</th>
                  <th className="py-2 px-3 text-right">Switch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 text-xs">
                {pairs.map((pair) => {
                  const isActive = pair.symbol === activeSymbol;
                  const isAPlus = pair.alignment.grade === "A+";
                  const p4h = pair.timeframes["4h"];
                  const p1h = pair.timeframes["1h"];
                  const p15m = pair.timeframes["15m"];
                  const p5m = pair.timeframes["5m"];

                  return (
                    <tr
                      key={pair.symbol}
                      onClick={() => onSelectSymbol(pair.symbol)}
                      className={`transition-colors cursor-pointer group ${
                        isActive
                          ? "bg-cyan-950/20 hover:bg-cyan-950/30 border-l-2 border-l-cyan-400"
                          : isAPlus
                          ? "bg-emerald-950/10 hover:bg-emerald-950/20 border-l-2 border-l-emerald-500"
                          : "hover:bg-zinc-900/50"
                      }`}
                    >
                      {/* Instrument */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-zinc-100 flex items-center gap-1.5 font-mono">
                            {pair.symbol}
                            {isActive && (
                              <span className="text-[9px] px-1 py-0.2 rounded font-sans font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-500 hidden md:inline">
                            {pair.name}
                          </span>
                        </div>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800/80 text-zinc-400 font-mono">
                          {pair.assetClass}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="py-2.5 px-3 font-mono font-medium text-zinc-200">
                        {pair.price.toFixed(pair.decimals)}
                      </td>

                      {/* 4H */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-0.5">
                          {getTrendBadge(p4h?.trend || "NEUTRAL", p4h?.rsi)}
                          <span className="text-[9px] text-zinc-500 truncate max-w-[90px]">
                            {p4h?.label}
                          </span>
                        </div>
                      </td>

                      {/* 1H */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-0.5">
                          {getTrendBadge(p1h?.trend || "NEUTRAL", p1h?.rsi)}
                          <span className="text-[9px] text-zinc-500 truncate max-w-[90px]">
                            {p1h?.label}
                          </span>
                        </div>
                      </td>

                      {/* 15m */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            {getTrendBadge(p15m?.trend || "NEUTRAL", p15m?.rsi)}
                            {pair.smc.pdZone === "DISCOUNT" && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-400 font-mono font-bold">
                                DISC
                              </span>
                            )}
                            {pair.smc.pdZone === "PREMIUM" && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-rose-500/15 text-rose-400 font-mono font-bold">
                                PREM
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] text-zinc-500 truncate max-w-[90px]">
                            {p15m?.label}
                          </span>
                        </div>
                      </td>

                      {/* 5m */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-0.5">
                          {getTrendBadge(p5m?.trend || "NEUTRAL", p5m?.rsi)}
                          <span className="text-[9px] text-zinc-500 truncate max-w-[90px]">
                            {p5m?.label}
                          </span>
                        </div>
                      </td>

                      {/* Confluence Alignment */}
                      <td className="py-2.5 px-3">
                        {getGradeBadge(pair)}
                      </td>

                      {/* Setup Action */}
                      <td className="py-2.5 px-3">
                        {pair.setup.action === "BUY" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            BUY {pair.setup.score}★
                          </span>
                        )}
                        {pair.setup.action === "SELL" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            SELL {pair.setup.score}★
                          </span>
                        )}
                        {pair.setup.action === "WAIT" && (
                          <span className="text-[10px] text-zinc-500 font-mono">
                            WAIT
                          </span>
                        )}
                      </td>

                      {/* Switch Action */}
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            onSelectSymbol(pair.symbol);
                          }}
                          className={`h-6 px-2 text-[10px] font-medium gap-1 cursor-pointer transition-all ${
                            isActive
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 group-hover:bg-zinc-800"
                          }`}
                        >
                          <span>{isActive ? "Selected" : "View"}</span>
                          <ArrowRight className="w-2.5 h-2.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
