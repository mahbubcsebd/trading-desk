"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SmcOrderBlocks } from "@/lib/engine";

interface OrderBlocksCardProps {
  orderBlocks?: SmcOrderBlocks;
  currentPrice: number;
}

export default function OrderBlocksCard({ orderBlocks, currentPrice }: OrderBlocksCardProps) {
  if (!orderBlocks) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/60 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
            Order Blocks & FVG
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-zinc-500 py-4">
          Mapping institutional blocks...
        </CardContent>
      </Card>
    );
  }

  const { bullishOB, bearishOB, nearestBullishFVG, nearestBearishFVG } = orderBlocks;

  return (
    <Card className="border-zinc-800 bg-zinc-900/70 shadow-lg backdrop-blur flex flex-col justify-between">
      <div>
        <CardHeader className="pb-3 border-b border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-violet-400" />
              <CardTitle className="text-xs uppercase tracking-wider text-zinc-200 font-bold">
                2. Order Blocks (OB) & Fair Value Gaps (FVG)
              </CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono text-violet-300 border-violet-500/30 bg-violet-500/10">
              {orderBlocks.activeFVGCount} Active Gaps
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-3 text-xs">
          {/* Institutional Order Blocks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Bullish OB (Demand) */}
            <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-emerald-400">Bullish OB (Demand)</span>
                <span className="text-[9px] font-mono text-emerald-500/80 uppercase">Support</span>
              </div>
              <div className="font-mono text-xs font-bold text-zinc-200">
                ${bullishOB.bottom.toFixed(2)} - ${bullishOB.top.toFixed(2)}
              </div>
              <div className="text-[10px] text-zinc-400">
                {currentPrice >= bullishOB.bottom && currentPrice <= bullishOB.top ? (
                  <span className="text-amber-300 font-semibold">Price currently inside OB!</span>
                ) : (
                  <span>Dist: ${(currentPrice - bullishOB.top).toFixed(2)} above</span>
                )}
              </div>
            </div>

            {/* Bearish OB (Supply) */}
            <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/30 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-rose-400">Bearish OB (Supply)</span>
                <span className="text-[9px] font-mono text-rose-500/80 uppercase">Resistance</span>
              </div>
              <div className="font-mono text-xs font-bold text-zinc-200">
                ${bearishOB.bottom.toFixed(2)} - ${bearishOB.top.toFixed(2)}
              </div>
              <div className="text-[10px] text-zinc-400">
                {currentPrice >= bearishOB.bottom && currentPrice <= bearishOB.top ? (
                  <span className="text-amber-300 font-semibold">Price currently inside OB!</span>
                ) : (
                  <span>Dist: ${(bearishOB.bottom - currentPrice).toFixed(2)} below</span>
                )}
              </div>
            </div>
          </div>

          {/* Fair Value Gaps (FVG) / Imbalances */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
              <span>Nearest Imbalances (FVG):</span>
              <span className="text-[10px] font-mono text-zinc-500">Unmitigated Target</span>
            </div>

            {/* Bullish FVG */}
            {nearestBullishFVG ? (
              <div className="p-2 rounded bg-zinc-950/50 border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="text-zinc-300 font-mono text-[11px]">
                    Bullish FVG: ${nearestBullishFVG.bottom.toFixed(2)} - ${nearestBullishFVG.top.toFixed(2)}
                  </span>
                </div>
                <Badge variant="outline" className="text-[9px] font-mono text-emerald-400 border-emerald-500/30">
                  +${nearestBullishFVG.size.toFixed(2)} Gap
                </Badge>
              </div>
            ) : (
              <div className="text-[10px] text-zinc-500 italic p-1.5">No active Bullish FVG nearby</div>
            )}

            {/* Bearish FVG */}
            {nearestBearishFVG ? (
              <div className="p-2 rounded bg-zinc-950/50 border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  <span className="text-zinc-300 font-mono text-[11px]">
                    Bearish FVG: ${nearestBearishFVG.bottom.toFixed(2)} - ${nearestBearishFVG.top.toFixed(2)}
                  </span>
                </div>
                <Badge variant="outline" className="text-[9px] font-mono text-rose-400 border-rose-500/30">
                  -${nearestBearishFVG.size.toFixed(2)} Gap
                </Badge>
              </div>
            ) : (
              <div className="text-[10px] text-zinc-500 italic p-1.5">No active Bearish FVG nearby</div>
            )}
          </div>
        </CardContent>
      </div>

      <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/30 text-[10px] text-zinc-500">
        Institutional rule: Unmitigated FVGs act as high-probability price magnets and entry triggers.
      </div>
    </Card>
  );
}
