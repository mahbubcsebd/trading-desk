"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SmcRisk } from "@/lib/engine";

interface RiskManagementCardProps {
  risk?: SmcRisk;
  symbol: string;
  currentPrice: number;
}

export default function RiskManagementCard({ risk, symbol, currentPrice }: RiskManagementCardProps) {
  const [balanceInput, setBalanceInput] = useState<number>(1000);
  const [riskPctInput, setRiskPctInput] = useState<number>(1.0);

  if (!risk) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/60 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
            Institutional Risk Management
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-zinc-500 py-4">
          Computing risk parameters...
        </CardContent>
      </Card>
    );
  }

  // Dynamic calculation based on user's selected balance and risk %
  const riskUsd = (balanceInput * (riskPctInput / 100.0));
  const slDist = risk.slPoints > 0 ? risk.slPoints : 2.5;

  // Contract specs for Exness:
  const dollarsPerPoint = symbol.includes("XAU") ? 100.0 : 1.0;
  const calculatedLots = Math.max(0.01, Number((riskUsd / (slDist * dollarsPerPoint)).toFixed(2)));

  const longSl = Number((currentPrice - slDist).toFixed(2));
  const longTp1 = Number((currentPrice + (2.0 * slDist)).toFixed(2));
  const longTp2 = Number((currentPrice + (3.5 * slDist)).toFixed(2));

  return (
    <Card className="border-zinc-800 bg-zinc-900/70 shadow-lg backdrop-blur flex flex-col justify-between">
      <div>
        <CardHeader className="pb-3 border-b border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              <CardTitle className="text-xs uppercase tracking-wider text-zinc-200 font-bold">
                6. Risk Management & Exness Position Sizing
              </CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono text-blue-300 border-blue-500/30 bg-blue-500/10">
              1% Capital Rule
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3.5 pt-3.5 text-xs">
          {/* Quick Balance & Risk % Picker */}
          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 font-medium">Account Capital:</span>
              <div className="flex space-x-1.5">
                {[500, 1000, 5000].map((b) => (
                  <button
                    key={b}
                    onClick={() => setBalanceInput(b)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      balanceInput === b
                        ? "bg-blue-600 text-white font-bold"
                        : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    ${b}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 font-medium">Risk Per Trade:</span>
              <div className="flex space-x-1.5">
                {[0.5, 1.0, 2.0].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRiskPctInput(r)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      riskPctInput === r
                        ? "bg-blue-600 text-white font-bold"
                        : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {r}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sizing & Targets Output Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded bg-zinc-950/50 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">Max Risk ($)</span>
              <span className="font-mono text-sm font-bold text-rose-400 mt-0.5 block">
                ${riskUsd.toFixed(2)}
              </span>
            </div>

            <div className="p-2 rounded bg-blue-950/20 border border-blue-500/30">
              <span className="text-[10px] text-blue-300 uppercase block font-semibold">Exness Lot Size</span>
              <span className="font-mono text-sm font-bold text-zinc-100 mt-0.5 block">
                {calculatedLots} Lots
              </span>
            </div>

            <div className="p-2 rounded bg-zinc-950/50 border border-zinc-800 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-zinc-500 uppercase block">Stop Distance</span>
              <span className="font-mono text-sm font-bold text-zinc-200 mt-0.5 block">
                ±${slDist.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Institutional Targets Road Map */}
          <div className="p-2 rounded bg-zinc-950/40 border border-zinc-800/60 space-y-1 text-[11px]">
            <div className="flex justify-between items-center text-zinc-400">
              <span>Target 1 (1:2 RR):</span>
              <span className="font-mono text-emerald-400 font-semibold">${longTp1} (Take 50% partials, move SL to BE)</span>
            </div>
            <div className="flex justify-between items-center text-zinc-400">
              <span>Target 2 (1:3.5 RR):</span>
              <span className="font-mono text-cyan-400 font-semibold">${longTp2} (Terminal Liquidity Runner)</span>
            </div>
          </div>

          {/* SMC Checklist Mini Badges */}
          <div className="space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase font-semibold block">SMC Execution Checklist</span>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              {risk.checklist.map((c, idx) => (
                <div
                  key={idx}
                  className={`p-1 px-1.5 rounded flex items-center justify-between ${
                    c.passed
                      ? "bg-emerald-950/20 border border-emerald-500/20 text-emerald-300"
                      : "bg-zinc-950/30 border border-zinc-900 text-zinc-500"
                  }`}
                >
                  <span className="truncate pr-1">{c.name}</span>
                  <span>{c.passed ? "✓" : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </div>

      <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/30 text-[10px] text-zinc-500">
        Institutional rule: Strictly limit risk to 1% per trade. Never widen a stop loss.
      </div>
    </Card>
  );
}

