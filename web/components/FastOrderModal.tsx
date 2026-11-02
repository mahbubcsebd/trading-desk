"use client";

import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Check,
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Code2,
  Layers,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import type { SnapshotData } from "@/lib/engine";

interface FastOrderModalProps {
  symbol: string;
  price: number;
  setup?: SnapshotData["setup"] | null;
  smc?: SnapshotData["smc"] | null;
  triggerButton?: React.ReactNode;
}

export default function FastOrderModal({
  symbol,
  price,
  setup,
  smc,
  triggerButton,
}: FastOrderModalProps) {
  const [open, setOpen] = useState(false);
  const [accountType, setAccountType] = useState<"standard" | "raw">("raw");
  const [activeTab, setActiveTab] = useState<"smc_limit" | "breakout_stop" | "market">("smc_limit");
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY");

  // Risk parameters
  const [balance, setBalance] = useState<number>(10000);
  const [riskPct, setRiskPct] = useState<number>(1.0);

  // Copied states for feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Exness MT5 Symbol naming
  const mt5Symbol = useMemo(() => {
    if (accountType === "standard") {
      return `${symbol}m`; // Exness standard accounts append 'm'
    }
    return symbol; // Exness Raw Spread, Zero, Pro use standard name
  }, [symbol, accountType]);

  // Derive Order Levels based on activeTab & orderSide
  const orderLevels = useMemo(() => {
    const isGold = symbol.toUpperCase().includes("XAU");
    const contractMultiplier = isGold ? 100 : 1; // 100 oz per gold lot, 1 coin per BTC lot

    let entry = price;
    let sl = price * 0.995;
    let tp1 = price * 1.01;
    let tp2 = price * 1.02;
    let orderType = orderSide === "BUY" ? "BUY LIMIT" : "SELL LIMIT";

    if (activeTab === "smc_limit" && smc) {
      if (orderSide === "BUY") {
        orderType = "BUY LIMIT";
        const bullOB = smc.orderBlocks?.bullishOB;
        entry = bullOB && bullOB.top > 0 ? bullOB.top : price * 0.998;
        sl = bullOB && bullOB.bottom > 0 ? bullOB.bottom - (isGold ? 0.8 : 80) : entry - (isGold ? 3.0 : 350);
        tp1 = smc.pdArray?.equilibrium || entry + (entry - sl) * 2;
        tp2 = smc.liquidity?.bsl?.level || entry + (entry - sl) * 3.5;
      } else {
        orderType = "SELL LIMIT";
        const bearOB = smc.orderBlocks?.bearishOB;
        entry = bearOB && bearOB.bottom > 0 ? bearOB.bottom : price * 1.002;
        sl = bearOB && bearOB.top > 0 ? bearOB.top + (isGold ? 0.8 : 80) : entry + (isGold ? 3.0 : 350);
        tp1 = smc.pdArray?.equilibrium || entry - (sl - entry) * 2;
        tp2 = smc.liquidity?.ssl?.level || entry - (sl - entry) * 3.5;
      }
    } else if (activeTab === "breakout_stop" && setup?.breakoutLevels) {
      if (orderSide === "BUY") {
        orderType = "BUY STOP";
        entry = setup.breakoutLevels.buyTrigger;
        sl = entry - 2 * setup.breakoutLevels.atr;
        tp1 = entry + 2.5 * setup.breakoutLevels.atr;
        tp2 = entry + 4 * setup.breakoutLevels.atr;
      } else {
        orderType = "SELL STOP";
        entry = setup.breakoutLevels.sellTrigger;
        sl = entry + 2 * setup.breakoutLevels.atr;
        tp1 = entry - 2.5 * setup.breakoutLevels.atr;
        tp2 = entry - 4 * setup.breakoutLevels.atr;
      }
    } else {
      // Market Execution (CMP)
      orderType = orderSide === "BUY" ? "BUY (MARKET)" : "SELL (MARKET)";
      entry = price;
      const buffer = isGold ? 2.5 : 300;
      sl = orderSide === "BUY" ? entry - buffer : entry + buffer;
      tp1 = orderSide === "BUY" ? entry + buffer * 2 : entry - buffer * 2;
      tp2 = orderSide === "BUY" ? entry + buffer * 3.5 : entry - buffer * 3.5;
    }

    const slDistance = Math.abs(entry - sl);
    const tp1Distance = Math.abs(tp1 - entry);
    const rr1 = slDistance > 0 ? tp1Distance / slDistance : 2.0;

    // Calculate exact 1% Exness Lot Size
    const dollarRisk = balance * (riskPct / 100);
    let exactLots = 0.01;
    if (slDistance > 0 && contractMultiplier > 0) {
      exactLots = dollarRisk / (slDistance * contractMultiplier);
    }
    // Round to 2 decimal places (or 3 for BTC), minimum 0.01
    const minLot = isGold ? 0.01 : 0.001;
    const lotSize = Math.max(minLot, Math.floor(exactLots * 100) / 100);
    const actualRiskUsd = lotSize * slDistance * contractMultiplier;
    const projectedProfitUsd = lotSize * tp1Distance * contractMultiplier;

    return {
      orderType,
      entry: Number(entry.toFixed(2)),
      sl: Number(sl.toFixed(2)),
      tp1: Number(tp1.toFixed(2)),
      tp2: Number(tp2.toFixed(2)),
      slDistance: Number(slDistance.toFixed(2)),
      rr1: Number(rr1.toFixed(1)),
      lotSize,
      actualRiskUsd: Number(actualRiskUsd.toFixed(2)),
      projectedProfitUsd: Number(projectedProfitUsd.toFixed(2)),
    };
  }, [symbol, price, activeTab, orderSide, smc, setup, balance, riskPct]);

  // Formatted Ticket Text
  const fullTicketText = useMemo(() => {
    return `=== EXNESS MT5 ORDER TICKET ===
Symbol:      ${mt5Symbol}
Order Type:  ${orderLevels.orderType}
Volume:      ${orderLevels.lotSize} Lots
Open Price:  $${orderLevels.entry.toFixed(2)}
Stop Loss:   $${orderLevels.sl.toFixed(2)} (-$${orderLevels.slDistance.toFixed(2)})
Take Profit: $${orderLevels.tp1.toFixed(2)}
-------------------------------
Risk Amount: $${orderLevels.actualRiskUsd.toFixed(2)} (${riskPct}% of $${balance})
Est. Profit: $${orderLevels.projectedProfitUsd.toFixed(2)} (1:${orderLevels.rr1} R:R)
Generated by TradeDesk Institutional Copilot`;
  }, [mt5Symbol, orderLevels, riskPct, balance]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button
            size="sm"
            variant="outline"
            className="border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-semibold gap-1.5 h-8 shadow-[0_0_12px_rgba(6,182,212,0.15)] cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-cyan-400 fill-current" />
            <span>Exness MT5 Fast Order</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[560px] bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="p-4 px-5 bg-gradient-to-r from-zinc-900 to-[#0F141F] border-b border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                <Zap className="w-4 h-4 fill-current" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                  <span>Exness MT5 Fast Order Ticket</span>
                  <Badge variant="outline" className="text-[10px] font-mono text-cyan-300 border-cyan-500/30 bg-cyan-500/10">
                    {mt5Symbol}
                  </Badge>
                </DialogTitle>
                <p className="text-[11px] text-zinc-400 font-mono">
                  Current Spot: <strong className="text-zinc-200">${price.toFixed(2)}</strong>
                </p>
              </div>
            </div>

            {/* Account Type Toggle */}
            <div className="flex items-center bg-zinc-950/80 p-0.5 rounded-lg border border-zinc-800 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => setAccountType("raw")}
                className={`px-2 py-0.5 rounded ${
                  accountType === "raw" ? "bg-cyan-500/20 text-cyan-300 font-bold" : "text-zinc-400"
                }`}
                title="Exness Raw Spread / Zero / Pro (No Suffix)"
              >
                Raw/Pro
              </button>
              <button
                type="button"
                onClick={() => setAccountType("standard")}
                className={`px-2 py-0.5 rounded ${
                  accountType === "standard" ? "bg-cyan-500/20 text-cyan-300 font-bold" : "text-zinc-400"
                }`}
                title="Exness Standard Account (Appends 'm')"
              >
                Standard (m)
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-4 text-xs font-sans max-h-[80vh] overflow-y-auto">
          {/* Order Strategy Selection Tabs */}
          <div className="flex items-center justify-between gap-1 p-1 bg-zinc-900/90 rounded-lg border border-zinc-800/80">
            <button
              type="button"
              onClick={() => setActiveTab("smc_limit")}
              className={`flex-1 py-1.5 px-2 rounded-md font-medium text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "smc_limit"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>SMC Order Block Limit</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("breakout_stop")}
              className={`flex-1 py-1.5 px-2 rounded-md font-medium text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "breakout_stop"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Breakout Stop</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("market")}
              className={`flex-1 py-1.5 px-2 rounded-md font-medium text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "market"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Instant Market</span>
            </button>
          </div>

          {/* Direction Toggle: BUY or SELL */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOrderSide("BUY")}
              className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                orderSide === "BUY"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                  : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800"
              }`}
            >
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>BUY SETUP</span>
            </button>

            <button
              type="button"
              onClick={() => setOrderSide("SELL")}
              className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                orderSide === "SELL"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.2)]"
                  : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800"
              }`}
            >
              <TrendingDown className="w-4 h-4 text-rose-400" />
              <span>SELL SETUP</span>
            </button>
          </div>

          {/* Risk Management / Lot Sizer Inputs */}
          <div className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800/80 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
              <span>Risk & Exness Position Sizing</span>
              <span className="font-mono text-cyan-400 font-bold">1% Institutional Formula</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">Account Balance ($)</label>
                <Input
                  type="number"
                  value={balance}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBalance(Math.max(10, parseFloat(e.target.value) || 0))}
                  className="h-8 text-xs font-mono bg-zinc-950 border-zinc-800"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">Risk Per Trade (%)</label>
                <div className="flex items-center space-x-1">
                  {[0.5, 1.0, 1.5, 2.0].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setRiskPct(pct)}
                      className={`flex-1 h-8 rounded text-[11px] font-mono font-semibold transition-all cursor-pointer border ${
                        riskPct === pct
                          ? "bg-blue-600 text-white border-blue-500"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* MT5 Order Parameters with One-Click Copy Buttons */}
          <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800/90 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                MT5 Order Parameters
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] font-mono font-bold ${
                  orderSide === "BUY"
                    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                    : "border-rose-500/40 text-rose-400 bg-rose-500/10"
                }`}
              >
                {orderLevels.orderType}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {/* Volume / Lot Size */}
              <div
                onClick={() => copyToClipboard(orderLevels.lotSize.toString(), "volume")}
                className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/90 hover:border-cyan-500/50 cursor-pointer transition-all group relative"
              >
                <span className="text-[10px] text-zinc-400 font-semibold block">Volume (Lots)</span>
                <span className="text-sm font-bold font-mono text-cyan-300 tabular-nums">
                  {orderLevels.lotSize}
                </span>
                <span className="absolute top-2 right-2 text-zinc-500 group-hover:text-cyan-300">
                  {copiedField === "volume" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </span>
              </div>

              {/* Entry Price */}
              <div
                onClick={() => copyToClipboard(orderLevels.entry.toString(), "entry")}
                className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/90 hover:border-cyan-500/50 cursor-pointer transition-all group relative"
              >
                <span className="text-[10px] text-zinc-400 font-semibold block">Open Price</span>
                <span className="text-sm font-bold font-mono text-zinc-100 tabular-nums">
                  ${orderLevels.entry.toFixed(2)}
                </span>
                <span className="absolute top-2 right-2 text-zinc-500 group-hover:text-cyan-300">
                  {copiedField === "entry" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </span>
              </div>

              {/* Stop Loss */}
              <div
                onClick={() => copyToClipboard(orderLevels.sl.toString(), "sl")}
                className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/90 hover:border-rose-500/50 cursor-pointer transition-all group relative"
              >
                <span className="text-[10px] text-zinc-400 font-semibold block">Stop Loss (SL)</span>
                <span className="text-sm font-bold font-mono text-rose-400 tabular-nums">
                  ${orderLevels.sl.toFixed(2)}
                </span>
                <span className="absolute top-2 right-2 text-zinc-500 group-hover:text-rose-400">
                  {copiedField === "sl" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </span>
              </div>

              {/* Take Profit */}
              <div
                onClick={() => copyToClipboard(orderLevels.tp1.toString(), "tp")}
                className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/90 hover:border-emerald-500/50 cursor-pointer transition-all group relative"
              >
                <span className="text-[10px] text-zinc-400 font-semibold block">Take Profit (TP)</span>
                <span className="text-sm font-bold font-mono text-emerald-400 tabular-nums">
                  ${orderLevels.tp1.toFixed(2)}
                </span>
                <span className="absolute top-2 right-2 text-zinc-500 group-hover:text-emerald-400">
                  {copiedField === "tp" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </span>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="flex flex-wrap items-center justify-between text-[11px] font-mono pt-2 border-t border-zinc-800/60 text-zinc-400">
              <span>Risk at SL: <strong className="text-rose-400">${orderLevels.actualRiskUsd}</strong> ({riskPct}%)</span>
              <span>Profit at TP: <strong className="text-emerald-400">+${orderLevels.projectedProfitUsd}</strong> (1:{orderLevels.rr1} R:R)</span>
            </div>
          </div>
        </div>

        <DialogFooter className="p-3.5 px-5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between sm:justify-between">
          <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
            Click any field above to copy individually
          </span>

          <Button
            size="sm"
            onClick={() => copyToClipboard(fullTicketText, "full_ticket")}
            className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs gap-1.5 h-8 shadow-[0_0_15px_rgba(6,182,212,0.3)] cursor-pointer"
          >
            {copiedField === "full_ticket" ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>Ticket Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Full MT5 Ticket</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
