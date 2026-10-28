"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, TrendingUp, TrendingDown, DollarSign, Activity, AlertTriangle } from "lucide-react";
import { addJournalTradeAction, deleteJournalTradeAction } from "@/app/actions";
import type { JournalTrade, JournalStats } from "@/lib/engine";

interface JournalClientProps {
  initialTrades: JournalTrade[];
  initialStats: JournalStats;
}

export default function JournalClient({ initialTrades, initialStats }: JournalClientProps) {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState("BUY");
  const [entry, setEntry] = useState("");
  const [exit, setExit] = useState("");
  const [sl, setSl] = useState("");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addJournalTradeAction({
        symbol,
        side,
        entry: parseFloat(entry),
        exit: parseFloat(exit),
        sl: parseFloat(sl),
        qty: parseFloat(qty),
        notes,
      });
      // Clear form on success
      setEntry("");
      setExit("");
      setSl("");
      setQty("");
      setNotes("");
    } catch {
      // error handling
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (tradeId: number) => {
    setDeletingId(tradeId);
    try {
      await deleteJournalTradeAction(tradeId);
    } catch {
      // error handling
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Daily Loss Limit Warning Banner */}
      {initialStats.dailyLimitHit && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 flex items-center space-x-3 text-red-400">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="text-xs">
            <strong className="block font-semibold">Daily Loss Limit Exceeded!</strong>
            Today&apos;s realized loss has reached or exceeded your configured daily limit. All new setups on the dashboard are locked.
          </div>
        </div>
      )}

      {/* 4 Stat Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Trades */}
        <Card className="border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs text-zinc-400 font-medium">Total Trades</span>
            <Activity className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {initialStats.trades}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Logged closed trades</p>
        </Card>

        {/* Win Rate */}
        <Card className="border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs text-zinc-400 font-medium">Win Rate</span>
            {initialStats.winRate >= 50 ? (
              <TrendingUp className="w-4 h-4 text-green-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-zinc-500" />
            )}
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {initialStats.winRate.toFixed(1)}%
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Profitable trades share
          </p>
        </Card>

        {/* Total R */}
        <Card className="border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs text-zinc-400 font-medium">Total R-Multiple</span>
            <DollarSign className="w-4 h-4 text-zinc-500" />
          </div>
          <div
            className={`text-2xl font-bold font-mono ${
              initialStats.totalR >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {initialStats.totalR >= 0 ? `+${initialStats.totalR.toFixed(2)}R` : `${initialStats.totalR.toFixed(2)}R`}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Expectancy: {initialStats.expectancy.toFixed(2)}R/trade
          </p>
        </Card>

        {/* Today's PnL */}
        <Card className="border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs text-zinc-400 font-medium">Today&apos;s Realized PnL</span>
            <DollarSign className="w-4 h-4 text-zinc-500" />
          </div>
          <div
            className={`text-2xl font-bold font-mono ${
              initialStats.todayPnlUsd >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {initialStats.todayPnlUsd >= 0
              ? `+$${initialStats.todayPnlUsd.toLocaleString()}`
              : `-$${Math.abs(initialStats.todayPnlUsd).toLocaleString()}`}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Net of fees & slippage</p>
        </Card>
      </div>

      {/* Log Trade Form */}
      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardHeader className="pb-3 border-b border-zinc-800/80">
          <CardTitle className="text-sm font-semibold text-zinc-200">
            Log Closed Trade
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400">
            Enter trade parameters. PnL and R-multiple are calculated automatically with exchange fees and slippage.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Symbol */}
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Asset</Label>
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 font-medium focus:outline-none"
                >
                  <option value="BTCUSDT">BTCUSDT</option>
                  <option value="XAUUSDT">XAUUSDT</option>
                </select>
              </div>

              {/* Side */}
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Side</Label>
                <select
                  value={side}
                  onChange={(e) => setSide(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 font-medium focus:outline-none"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>

              {/* Entry */}
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Entry Price</Label>
                <Input
                  type="number"
                  step="any"
                  min="0.0001"
                  placeholder="e.g. 80500"
                  value={entry}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEntry(e.target.value)}
                  className="h-8 border-zinc-700 bg-zinc-950 text-xs font-mono"
                  required
                />
              </div>

              {/* Exit */}
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Exit Price</Label>
                <Input
                  type="number"
                  step="any"
                  min="0.0001"
                  placeholder="e.g. 81500"
                  value={exit}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExit(e.target.value)}
                  className="h-8 border-zinc-700 bg-zinc-950 text-xs font-mono"
                  required
                />
              </div>

              {/* Stop Loss */}
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Stop Loss</Label>
                <Input
                  type="number"
                  step="any"
                  min="0.0001"
                  placeholder="e.g. 79900"
                  value={sl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSl(e.target.value)}
                  className="h-8 border-zinc-700 bg-zinc-950 text-xs font-mono"
                  required
                />
              </div>

              {/* Qty */}
              <div className="space-y-1">
                <Label className="text-xs text-zinc-400">Quantity</Label>
                <Input
                  type="number"
                  step="any"
                  min="0.00001"
                  placeholder="e.g. 0.15"
                  value={qty}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQty(e.target.value)}
                  className="h-8 border-zinc-700 bg-zinc-950 text-xs font-mono"
                  required
                />
              </div>
            </div>

            {/* Notes and Submit */}
            <div className="flex flex-col sm:flex-row items-end gap-3 pt-1">
              <div className="space-y-1 flex-1 w-full">
                <Label className="text-xs text-zinc-400">Trade Notes</Label>
                <Input
                  type="text"
                  placeholder="Setup context, execution observations..."
                  value={notes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)}
                  className="h-8 border-zinc-700 bg-zinc-950 text-xs"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={submitting}
                className="h-8 text-xs bg-zinc-100 text-zinc-900 hover:bg-zinc-200 font-semibold px-4 w-full sm:w-auto"
              >
                {submitting ? "Logging..." : "Log Trade"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Trades Log Table */}
      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardHeader className="pb-3 border-b border-zinc-800/80">
          <CardTitle className="text-sm font-semibold text-zinc-200">
            Trade History Log
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800/80 hover:bg-transparent">
                <TableHead className="text-zinc-400 font-semibold text-xs">Date</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs">Asset</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs">Side</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Entry</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Exit</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Stop</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Qty</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Net PnL ($)</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">R-Multiple</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs">Notes</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialTrades.length === 0 ? (
                <TableRow className="border-zinc-800/80">
                  <TableCell colSpan={11} className="text-center py-8 text-xs text-zinc-500">
                    No closed trades recorded yet. Log your completed trades above.
                  </TableCell>
                </TableRow>
              ) : (
                initialTrades.map((t) => (
                  <TableRow key={t.id} className="border-zinc-800/40 hover:bg-zinc-800/30">
                    <TableCell className="text-xs text-zinc-400 font-mono">
                      {new Date(t.closedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-zinc-200">
                      {t.symbol}
                    </TableCell>
                    <TableCell className="text-xs font-semibold">
                      <span className={t.side === "BUY" ? "text-green-400" : "text-red-400"}>
                        {t.side}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-zinc-200 text-right tabular-nums">
                      {t.entry.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-zinc-200 text-right tabular-nums">
                      {t.exit.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-red-400 text-right tabular-nums">
                      {t.sl.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-zinc-200 text-right tabular-nums">
                      {t.qty}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-right tabular-nums">
                      <span className={t.pnlUsd >= 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                        {t.pnlUsd >= 0 ? `+$${t.pnlUsd.toLocaleString()}` : `-$${Math.abs(t.pnlUsd).toLocaleString()}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-right tabular-nums">
                      <span className={t.rMultiple >= 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                        {t.rMultiple >= 0 ? `+${t.rMultiple}R` : `${t.rMultiple}R`}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400 max-w-[150px] truncate">
                      {t.notes || "--"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={deletingId === t.id}
                        onClick={() => handleDelete(t.id)}
                        className="h-7 w-7 text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                        title="Delete trade"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
