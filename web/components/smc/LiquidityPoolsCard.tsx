"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SmcLiquidity } from "@/lib/engine";

interface LiquidityPoolsCardProps {
  liquidity?: SmcLiquidity;
  currentPrice: number;
}

export default function LiquidityPoolsCard({ liquidity, currentPrice }: LiquidityPoolsCardProps) {
  if (!liquidity) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/60 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
            Liquidity Pools (BSL / SSL)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-zinc-500 py-4">
          Tracking liquidity resting pools...
        </CardContent>
      </Card>
    );
  }

  const { bsl, ssl, sweep, internalTarget } = liquidity;

  return (
    <Card className="border-zinc-800 bg-zinc-900/70 shadow-lg backdrop-blur flex flex-col justify-between">
      <div>
        <CardHeader className="pb-3 border-b border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <CardTitle className="text-xs uppercase tracking-wider text-zinc-200 font-bold">
                3. Liquidity Pools & Sweeps (BSL / SSL)
              </CardTitle>
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] font-mono px-2 py-0.5 border ${
                sweep.detected
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                  : "bg-zinc-800/80 text-zinc-400 border-zinc-700"
              }`}
            >
              {sweep.detected ? "Sweep Active!" : "Pools Resting"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-3 text-xs">
          {/* Sweep status banner */}
          {sweep.detected ? (
            <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/40 text-amber-200 space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-[11px]">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                <span>LIQUIDITY RAID DETECTED (Turtle Soup)</span>
              </div>
              <p className="text-[11px] font-mono text-zinc-300">{sweep.desc}</p>
            </div>
          ) : (
            <div className="p-2 rounded bg-zinc-950/40 border border-zinc-800/50 flex items-center justify-between text-zinc-400 text-[11px]">
              <span>Next Draw on Liquidity (DOL):</span>
              <span className="font-semibold text-cyan-300 font-mono">{internalTarget}</span>
            </div>
          )}

          {/* BSL & SSL Pools Grid */}
          <div className="grid grid-cols-2 gap-2">
            {/* Buy-side Liquidity (BSL) */}
            <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-300">Buy-Side (BSL)</span>
                <span className="text-[9px] font-mono text-cyan-400">Buy Stops</span>
              </div>
              <div className="font-mono text-xs font-bold text-zinc-100">
                ${bsl.level.toFixed(2)}
              </div>
              <div className="text-[10px] text-zinc-400 flex items-center justify-between">
                <span>Dist:</span>
                <span className="font-mono text-zinc-300">+${bsl.distance.toFixed(2)}</span>
              </div>
            </div>

            {/* Sell-side Liquidity (SSL) */}
            <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-300">Sell-Side (SSL)</span>
                <span className="text-[9px] font-mono text-rose-400">Sell Stops</span>
              </div>
              <div className="font-mono text-xs font-bold text-zinc-100">
                ${ssl.level.toFixed(2)}
              </div>
              <div className="text-[10px] text-zinc-400 flex items-center justify-between">
                <span>Dist:</span>
                <span className="font-mono text-zinc-300">-${ssl.distance.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </div>

      <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/30 text-[10px] text-zinc-500">
        Institutional rule: Smart money sweeps retail stop orders (BSL/SSL) to fill large orders.
      </div>
    </Card>
  );
}

