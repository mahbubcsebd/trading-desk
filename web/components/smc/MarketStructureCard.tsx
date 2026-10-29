"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SmcStructure } from "@/lib/engine";

interface MarketStructureCardProps {
  structure?: SmcStructure;
}

export default function MarketStructureCard({ structure }: MarketStructureCardProps) {
  if (!structure) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/60 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
            Market Structure (BOS / CHoCH)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-zinc-500 py-4">
          Computing structure...
        </CardContent>
      </Card>
    );
  }

  const isBull = structure.trend === "BULLISH";
  const isBear = structure.trend === "BEARISH";

  const trendBadgeColor = isBull
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
    : isBear
    ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
    : "bg-zinc-800 text-zinc-400 border-zinc-700";

  return (
    <Card className="border-zinc-800 bg-zinc-900/70 shadow-lg backdrop-blur flex flex-col justify-between">
      <div>
        <CardHeader className="pb-3 border-b border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <CardTitle className="text-xs uppercase tracking-wider text-zinc-200 font-bold">
                1. Market Structure & Trend Flow
              </CardTitle>
            </div>
            <Badge variant="outline" className={`text-[10px] font-mono uppercase px-2.5 py-0.5 border ${trendBadgeColor}`}>
              {structure.trend}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3.5 pt-3.5 text-xs">
          {/* Break of Structure (BOS) */}
          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <span className="font-semibold text-zinc-300">BOS (Break of Structure)</span>
                <span className="text-[10px] text-zinc-500 font-mono">15m</span>
              </div>
              <Badge
                variant="outline"
                className={`text-[9px] uppercase font-mono px-1.5 py-0 ${
                  structure.bos.broken
                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                    : "bg-zinc-800/60 text-zinc-400 border-zinc-700"
                }`}
              >
                {structure.bos.broken ? "Confirmed BOS" : "Intact"}
              </Badge>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono">
              {structure.bos.status}
            </p>
          </div>

          {/* Change of Character (CHoCH) */}
          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <span className="font-semibold text-zinc-300">CHoCH (Character Shift)</span>
                <span className="text-[10px] text-zinc-500 font-mono">Reversal</span>
              </div>
              <Badge
                variant="outline"
                className={`text-[9px] uppercase font-mono px-1.5 py-0 ${
                  structure.choch.active
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                    : "bg-zinc-800/60 text-zinc-500 border-zinc-700"
                }`}
              >
                {structure.choch.active ? "CHoCH Active" : "No Shift"}
              </Badge>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono">
              {structure.choch.status}
            </p>
          </div>

          {/* Major Swings Range */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded bg-zinc-950/40 border border-zinc-800/40">
              <div className="text-zinc-500">Major Swing High</div>
              <div className="font-mono font-bold text-zinc-200 mt-0.5">
                ${structure.swingHigh.toFixed(2)}
              </div>
            </div>
            <div className="p-2 rounded bg-zinc-950/40 border border-zinc-800/40">
              <div className="text-zinc-500">Major Swing Low</div>
              <div className="font-mono font-bold text-zinc-200 mt-0.5">
                ${structure.swingLow.toFixed(2)}
              </div>
            </div>
          </div>
        </CardContent>
      </div>

      <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/30 text-[10px] text-zinc-500">
        Institutional rule: Follow established BOS direction until valid CHoCH triggers.
      </div>
    </Card>
  );
}

