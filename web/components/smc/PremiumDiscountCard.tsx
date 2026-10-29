"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SmcPdArray } from "@/lib/engine";

interface PremiumDiscountCardProps {
  pdArray?: SmcPdArray;
  currentPrice: number;
}

export default function PremiumDiscountCard({ pdArray, currentPrice }: PremiumDiscountCardProps) {
  if (!pdArray) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/60 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
            Premium vs Discount (PD Arrays)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-zinc-500 py-4">
          Calculating Equilibrium & PD Array...
        </CardContent>
      </Card>
    );
  }

  const isDiscount = pdArray.zone === "DISCOUNT";
  const isPremium = pdArray.zone === "PREMIUM";

  const zoneBadgeColor = isDiscount
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
    : isPremium
    ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
    : "bg-amber-500/10 text-amber-400 border-amber-500/30";

  return (
    <Card className="border-zinc-800 bg-zinc-900/70 shadow-lg backdrop-blur flex flex-col justify-between">
      <div>
        <CardHeader className="pb-3 border-b border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <CardTitle className="text-xs uppercase tracking-wider text-zinc-200 font-bold">
                4. Premium vs Discount (PD Arrays & OTE)
              </CardTitle>
            </div>
            <Badge variant="outline" className={`text-[10px] font-mono uppercase px-2.5 py-0.5 border ${zoneBadgeColor}`}>
              {pdArray.zone} ({pdArray.currentPercent.toFixed(0)}%)
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3.5 pt-3.5 text-xs">
          {/* Institutional Bias Hint */}
          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-zinc-400">Institutional Mandate:</span>
              <div className="font-semibold text-zinc-200 mt-0.5">{pdArray.actionHint}</div>
            </div>
            <div className="text-right font-mono">
              <div className="text-[10px] text-zinc-500">50% Equilibrium</div>
              <div className="text-zinc-300 font-bold">${pdArray.equilibrium.toFixed(2)}</div>
            </div>
          </div>

          {/* Visual PD Dealing Range Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>0% Low (${pdArray.rangeLow.toFixed(2)})</span>
              <span className="text-amber-400/80">EQ 50%</span>
              <span>100% High (${pdArray.rangeHigh.toFixed(2)})</span>
            </div>

            {/* Meter Bar */}
            <div className="relative w-full h-3.5 rounded-full overflow-hidden bg-zinc-950 border border-zinc-800 flex">
              {/* Discount half (0 - 50%) */}
              <div className="w-1/2 h-full bg-emerald-950/60 border-r border-amber-400/60 relative">
                <span className="absolute left-2 top-0 text-[8px] font-bold text-emerald-500/80 uppercase leading-3">
                  Discount
                </span>
              </div>
              {/* Premium half (50 - 100%) */}
              <div className="w-1/2 h-full bg-rose-950/60 relative">
                <span className="absolute right-2 top-0 text-[8px] font-bold text-rose-500/80 uppercase leading-3">
                  Premium
                </span>
              </div>
              {/* Current Price Marker Pin */}
              <div
                className="absolute top-0 bottom-0 w-1.5 bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.8)] -ml-0.5"
                style={{ left: `${pdArray.currentPercent}%` }}
              />
            </div>
          </div>

          {/* Optimal Trade Entry (OTE - 61.8% to 78.6% Fib) */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded bg-zinc-950/40 border border-zinc-800/40">
              <span className="text-emerald-400 font-semibold text-[10px] block">Long OTE Zone (Fib)</span>
              <span className="font-mono text-zinc-200">
                ${pdArray.oteLong.bottom.toFixed(2)} - ${pdArray.oteLong.top.toFixed(2)}
              </span>
            </div>
            <div className="p-2 rounded bg-zinc-950/40 border border-zinc-800/40">
              <span className="text-rose-400 font-semibold text-[10px] block">Short OTE Zone (Fib)</span>
              <span className="font-mono text-zinc-200">
                ${pdArray.oteShort.bottom.toFixed(2)} - ${pdArray.oteShort.top.toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </div>

      <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/30 text-[10px] text-zinc-500">
        Institutional rule: Never buy in Premium. Never sell in Discount. Seek OTE retracements.
      </div>
    </Card>
  );
}
