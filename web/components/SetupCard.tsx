"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SnapshotData } from "@/lib/engine";

interface SetupCardProps {
  setup: SnapshotData["setup"];
  symbol: string;
  price: number;
  dailyLimitHit?: boolean;
}

export default function SetupCard({
  setup,
  symbol,
  price,
  dailyLimitHit = false,
}: SetupCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLevels = () => {
    if (!setup || setup.action === "WAIT") return;
    const text = `${symbol} ${setup.action}\nEntry: ${setup.entry}\nStop: ${setup.sl}\nTarget: ${setup.tp}\nSize: ${setup.qty}\nRisk: $${setup.riskUsd}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired = setup.validUntil > 0 && Date.now() > setup.validUntil;

  // 1. Daily Limit Hit Lock State
  if (dailyLimitHit) {
    return (
      <Card className="border-red-950/60 bg-red-950/20 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-wider text-red-400 font-semibold">
            Best Setup Now
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-center">
            <span className="text-sm font-semibold text-red-400 block mb-1">
              Daily Loss Limit Reached
            </span>
            <span className="text-xs text-red-300/80">
              New setups are locked for today to protect capital.
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 2. WAIT State
  if (!setup || setup.action === "WAIT") {
    return (
      <Card className="border-zinc-800 bg-zinc-900/60 shadow-lg backdrop-blur">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
            Best Setup Now
          </CardTitle>
          <Badge variant="outline" className="text-[11px] border-zinc-700 text-zinc-400">
            Score: {setup?.score ?? 0} / 100
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="flex items-center space-x-3">
            <span className="text-2xl font-black tracking-tight text-zinc-400">
              WAIT
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              Market Price: ${price.toLocaleString()}
            </span>
          </div>

          <div className="rounded-md border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <p className="text-xs text-zinc-300 font-medium">
              {setup?.waitReason || "No strategy has a valid setup right now."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 3. Active BUY / SELL Setup
  const isBuy = setup.action === "BUY";
  const actionColor = isBuy
    ? "text-green-500 border-green-500/30 bg-green-500/10"
    : "text-red-500 border-red-500/30 bg-red-500/10";

  return (
    <Card
      className={`border-zinc-800 bg-zinc-900/60 shadow-xl backdrop-blur transition-opacity ${
        isExpired ? "opacity-50" : ""
      }`}
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="space-y-0.5">
          <CardTitle className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
            Best Setup Now
          </CardTitle>
          {setup.strategy && (
            <p className="text-[11px] text-zinc-500 font-medium">
              Strategy: <span className="text-zinc-300 uppercase">{setup.strategy}</span>
            </p>
          )}
        </div>
        <Badge
          variant="outline"
          className="text-xs font-mono font-semibold border-zinc-700 text-zinc-200"
        >
          Score: {setup.score} / 100
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {isExpired && (
          <div className="rounded bg-zinc-800/60 px-2 py-1 text-center text-[11px] text-zinc-400">
            Setup expired, wait for the next one
          </div>
        )}

        <div className="flex items-baseline justify-between">
          <span
            className={`inline-flex items-center px-3 py-1 rounded text-2xl font-black border tracking-wider ${actionColor}`}
          >
            {setup.action}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyLevels}
            className="h-7 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          >
            {copied ? "Copied!" : "Copy levels"}
          </Button>
        </div>

        {/* 6 Key Numbers with Tabular Nums */}
        <div className="grid grid-cols-3 gap-2 py-2 border-y border-zinc-800/80 text-xs">
          <div>
            <span className="text-[10px] uppercase text-zinc-500 font-medium block">Entry</span>
            <span className="font-mono font-semibold text-zinc-100 tabular-nums">
              {setup.entry.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-zinc-500 font-medium block">Stop</span>
            <span className="font-mono font-semibold text-red-400 tabular-nums">
              {setup.sl.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-zinc-500 font-medium block">Target</span>
            <span className="font-mono font-semibold text-green-400 tabular-nums">
              {setup.tp.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-zinc-500 font-medium block">R:R</span>
            <span className="font-mono font-semibold text-zinc-100 tabular-nums">
              {setup.rr}R
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-zinc-500 font-medium block">Size</span>
            <span className="font-mono font-semibold text-zinc-100 tabular-nums">
              {setup.qty}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-zinc-500 font-medium block">Risk $</span>
            <span className="font-mono font-semibold text-zinc-100 tabular-nums">
              ${setup.riskUsd}
            </span>
          </div>
        </div>

        {/* Why Reasons list (at most 5 reasons) */}
        {setup.reasons && setup.reasons.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Why this setup
            </span>
            <ul className="space-y-1 text-xs text-zinc-300">
              {setup.reasons.slice(0, 5).map((r, i) => (
                <li key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-300">• {r.label}</span>
                  <span className="font-mono text-zinc-500">+{r.points}pts</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
