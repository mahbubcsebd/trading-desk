"use client";

import React, { useState } from "react";
import MarketStructureCard from "./MarketStructureCard";
import OrderBlocksCard from "./OrderBlocksCard";
import LiquidityPoolsCard from "./LiquidityPoolsCard";
import PremiumDiscountCard from "./PremiumDiscountCard";
import KillzonesCard from "./KillzonesCard";
import RiskManagementCard from "./RiskManagementCard";
import type { SmcAnalysisData } from "@/lib/engine";
import { Badge } from "@/components/ui/badge";

interface SmcAnalysisDeckProps {
  smc?: SmcAnalysisData;
  symbol: string;
  price: number;
}

export default function SmcAnalysisDeck({ smc, symbol, price }: SmcAnalysisDeckProps) {
  const [filter, setFilter] = useState<string>("all");

  if (!smc) {
    return (
      <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 text-center text-xs text-zinc-500">
        Syncing real-time ICT / SMC Market Flow Data...
      </div>
    );
  }

  const confluenceScore = smc.risk.confluenceScore;
  const scoreColor =
    confluenceScore >= 75
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      : confluenceScore >= 50
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
      : "text-zinc-400 bg-zinc-800 border-zinc-700";

  return (
    <div className="space-y-4">
      {/* Deck Header & Institutional Confluence Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 shadow-xl">
        <div>
          <div className="flex items-center space-x-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)]" />
            <h2 className="text-sm font-bold tracking-tight text-zinc-100 uppercase">
              Institutional SMC & ICT Market Deck — {symbol}
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time algorithmic Smart Money Concepts: Order Blocks, Fair Value Gaps, Liquidity Sweeps, PD Arrays & Risk.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
              SMC Confluence
            </div>
            <div className="text-sm font-mono font-bold text-zinc-200">
              {confluenceScore} / 100
            </div>
          </div>
          <Badge variant="outline" className={`text-xs font-mono font-bold px-3 py-1 border ${scoreColor}`}>
            {confluenceScore >= 70 ? "HIGH PROBABILITY" : "WAIT FOR ALIGNMENT"}
          </Badge>
        </div>
      </div>

      {/* Filter Tabs for Quick Switching */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
        {[
          { id: "all", label: "Full Market View (All Cards)" },
          { id: "structure", label: "1. Market Structure" },
          { id: "blocks", label: "2. Order Blocks & FVG" },
          { id: "liquidity", label: "3. Liquidity & Sweeps" },
          { id: "pd", label: "4. Premium / Discount" },
          { id: "killzone", label: "5. Killzones" },
          { id: "risk", label: "6. Risk Management" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-3 py-1.5 rounded-lg font-medium text-xs whitespace-nowrap transition-colors ${
              filter === tab.id
                ? "bg-zinc-100 text-zinc-900 shadow font-semibold"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 bg-zinc-900/60 border border-zinc-800/60"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid of SMC Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
        {(filter === "all" || filter === "structure") && (
          <MarketStructureCard structure={smc.structure} />
        )}

        {(filter === "all" || filter === "blocks") && (
          <OrderBlocksCard orderBlocks={smc.orderBlocks} currentPrice={price} />
        )}

        {(filter === "all" || filter === "liquidity") && (
          <LiquidityPoolsCard liquidity={smc.liquidity} currentPrice={price} />
        )}

        {(filter === "all" || filter === "pd") && (
          <PremiumDiscountCard pdArray={smc.pdArray} currentPrice={price} />
        )}

        {(filter === "all" || filter === "killzone") && (
          <KillzonesCard killzone={smc.killzone} />
        )}

        {(filter === "all" || filter === "risk") && (
          <RiskManagementCard risk={smc.risk} symbol={symbol} currentPrice={price} />
        )}
      </div>
    </div>
  );
}

