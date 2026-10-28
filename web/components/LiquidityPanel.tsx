"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SnapshotData } from "@/lib/engine";

interface LiquidityPanelProps {
  liquidity: SnapshotData["liquidity"];
}

export default function LiquidityPanel({ liquidity }: LiquidityPanelProps) {
  // Simple reading helpers
  const getImbalanceReading = (imb: number) => {
    if (imb > 0.05) return { word: "Bullish", color: "text-green-400" };
    if (imb < -0.05) return { word: "Bearish", color: "text-red-400" };
    return { word: "Neutral", color: "text-zinc-500" };
  };

  const getTakerReading = (pct: number) => {
    if (pct > 53) return { word: "Bullish", color: "text-green-400" };
    if (pct < 47) return { word: "Bearish", color: "text-red-400" };
    return { word: "Neutral", color: "text-zinc-500" };
  };

  const imbReading = getImbalanceReading(liquidity.bookImbalance);
  const takerReading = getTakerReading(liquidity.takerBuyPct);

  return (
    <Card className="border-zinc-800 bg-zinc-900/60 shadow-md backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
          Liquidity & Flow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Book Imbalance (±0.25%)</span>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-zinc-200 tabular-nums">
              {(liquidity.bookImbalance * 100).toFixed(1)}%
            </span>
            <span className={`text-[11px] font-medium ${imbReading.color}`}>
              {imbReading.word}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-zinc-500">5m Taker Flow</span>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-zinc-200 tabular-nums">
              {liquidity.takerBuyPct.toFixed(0)}% Buy
            </span>
            <span className={`text-[11px] font-medium ${takerReading.color}`}>
              {takerReading.word}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-zinc-500">15m OI Change</span>
          <span className="font-mono text-zinc-200 tabular-nums">
            {(liquidity.oiChange15mPct * 100).toFixed(2)}%
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Funding Rate</span>
          <span className="font-mono text-zinc-200 tabular-nums">
            {(liquidity.funding * 100).toFixed(4)}%
          </span>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80 text-[11px]">
          <span className="text-zinc-500">Nearest Walls</span>
          <span className="font-mono text-zinc-400">
            {liquidity.buyWall ? `$${liquidity.buyWall.price}` : "—"} /{" "}
            {liquidity.sellWall ? `$${liquidity.sellWall.price}` : "—"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
