"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SnapshotData } from "@/lib/engine";

interface StrategiesPanelProps {
  strategies: SnapshotData["strategies"];
}

export default function StrategiesPanel({ strategies }: StrategiesPanelProps) {
  const getStateBadge = (state: string, enabled: boolean) => {
    if (!enabled) {
      return (
        <Badge variant="outline" className="text-[10px] uppercase border-zinc-800 text-zinc-600 bg-zinc-950">
          Disabled
        </Badge>
      );
    }
    if (state === "signal") {
      return (
        <Badge variant="outline" className="text-[10px] uppercase border-green-500/30 text-green-400 bg-green-500/10 animate-pulse">
          Signal
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px] uppercase border-zinc-700 text-zinc-400 bg-zinc-800/40">
        Idle
      </Badge>
    );
  };

  return (
    <Card className="border-zinc-800 bg-zinc-900/60 shadow-md backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
          Strategies Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-1 text-xs">
        {strategies.map((strat) => (
          <div key={strat.id} className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="font-semibold text-zinc-200 uppercase tracking-tight block">
                {strat.id}
              </span>
              <span className="text-[10px] text-zinc-500">
                {strat.id === "trend"
                  ? "Donchian Breakout"
                  : strat.id === "reversion"
                  ? "Bollinger Reversion"
                  : "Liquidity Sweep"}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                PF {strat.oosProfitFactor ? strat.oosProfitFactor.toFixed(2) : "--"}
              </span>
              {getStateBadge(strat.state, strat.enabled)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
