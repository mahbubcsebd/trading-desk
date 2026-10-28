"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SnapshotData } from "@/lib/engine";

interface ContextPanelProps {
  regime: SnapshotData["regime"];
  bias: SnapshotData["bias"];
}

export default function ContextPanel({ regime, bias }: ContextPanelProps) {
  const isTrending = regime.state === "trending";
  const getBiasColor = (b: string) => {
    if (b === "bull") return "text-green-400 bg-green-500/10 border-green-500/20";
    if (b === "bear") return "text-red-400 bg-red-500/10 border-red-500/20";
    return "text-zinc-400 bg-zinc-800 border-zinc-700";
  };

  return (
    <Card className="border-zinc-800 bg-zinc-900/60 shadow-md backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
          Market Context
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">1h Regime</span>
          <div className="flex items-center space-x-1.5">
            <span className="font-semibold text-zinc-200 capitalize">{regime.state}</span>
            {regime.adx > 0 && (
              <span className="text-[11px] font-mono text-zinc-500">
                (ADX {regime.adx.toFixed(1)})
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Volatility</span>
          <span className="font-semibold text-zinc-200 capitalize">
            {regime.volatility}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-zinc-500">4h Bias</span>
          <Badge variant="outline" className={`text-[10px] font-mono uppercase px-2 py-0.5 border ${getBiasColor(bias.h4)}`}>
            {bias.h4}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-zinc-500">1h Bias</span>
          <Badge variant="outline" className={`text-[10px] font-mono uppercase px-2 py-0.5 border ${getBiasColor(bias.h1)}`}>
            {bias.h1}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
