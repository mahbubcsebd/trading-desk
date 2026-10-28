import React, { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getBacktest, getSignals, type BacktestResult } from "@/lib/engine";
import { connection } from "next/server";

async function BacktestData() {
  await connection();
  let btcResults: BacktestResult[] = [];
  let xauResults: BacktestResult[] = [];
  let signalsData: Awaited<ReturnType<typeof getSignals>> = {
    signals: [],
    stats: { count: 0, winRate: 0, avgR: 0, expectancy: 0 },
  };

  try {
    btcResults = await getBacktest("BTCUSD");
  } catch {
    btcResults = [];
  }

  try {
    xauResults = await getBacktest("XAUUSD");
  } catch {
    xauResults = [];
  }

  try {
    signalsData = await getSignals(undefined, 50);
  } catch {
    signalsData = {
      signals: [],
      stats: { count: 0, winRate: 0, avgR: 0, expectancy: 0 },
    };
  }

  const renderTable = (symbolName: string, symbolCode: string, results: BacktestResult[]) => {
    return (
      <Card className="border-zinc-800 bg-zinc-900/60 shadow-lg">
        <CardHeader className="pb-3 border-b border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-zinc-100">
                {symbolName} ({symbolCode})
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400 mt-0.5">
                15m candles • 70% In-Sample / 30% Out-of-Sample validation
              </CardDescription>
            </div>
            {results.length > 0 && results[0].run_at > 0 && (
              <span className="text-[11px] font-mono text-zinc-500">
                Last run: {new Date(results[0].run_at).toLocaleString()}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800/80 hover:bg-transparent">
                <TableHead className="text-zinc-400 font-semibold text-xs">Strategy</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs">Period</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Trades</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Win Rate</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Expectancy</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Profit Factor</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Max DD</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.length === 0 ? (
                <TableRow className="border-zinc-800/80">
                  <TableCell colSpan={8} className="text-center py-6 text-xs text-zinc-500">
                    No backtest results found. Run CLI: <code className="text-zinc-300">uv run python -m app.backtest --symbol {symbolCode}</code>
                  </TableCell>
                </TableRow>
              ) : (
                results.flatMap((res) => [
                  // In-Sample Row
                  <TableRow key={`${res.strategy}-in`} className="border-zinc-800/40 hover:bg-zinc-800/30">
                    <TableCell className="font-semibold text-zinc-200 uppercase text-xs">
                      {res.strategy}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400">In-Sample (70%)</TableCell>
                    <TableCell className="font-mono text-xs text-right tabular-nums text-zinc-300">
                      {res.in_sample?.trades ?? 0}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right tabular-nums text-zinc-300">
                      {res.in_sample?.win_rate ?? 0}%
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right tabular-nums text-zinc-300">
                      {res.in_sample?.expectancy ?? 0}R
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right tabular-nums text-zinc-300">
                      {res.in_sample?.profit_factor ?? 0}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right tabular-nums text-red-400">
                      {res.in_sample?.max_drawdown ?? 0}R
                    </TableCell>
                    <TableCell className="text-center" rowSpan={2}>
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase font-mono px-2 py-0.5 ${
                          res.enabled
                            ? "border-green-500/30 text-green-400 bg-green-500/10"
                            : "border-zinc-800 text-zinc-600 bg-zinc-950"
                        }`}
                      >
                        {res.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                  </TableRow>,
                  // Out-of-Sample Row
                  <TableRow key={`${res.strategy}-out`} className="border-zinc-800/80 bg-zinc-950/20 hover:bg-zinc-800/30">
                    <TableCell className="font-semibold text-zinc-400 uppercase text-xs pl-6">
                      ↳ Validation
                    </TableCell>
                    <TableCell className="text-xs text-zinc-300 font-medium">Out-of-Sample (30%)</TableCell>
                    <TableCell className="font-mono text-xs text-right tabular-nums text-zinc-200 font-semibold">
                      {res.out_of_sample?.trades ?? 0}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right tabular-nums text-zinc-200 font-semibold">
                      {res.out_of_sample?.win_rate ?? 0}%
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right tabular-nums text-zinc-200 font-semibold">
                      {res.out_of_sample?.expectancy ?? 0}R
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right tabular-nums text-zinc-200 font-semibold">
                      {res.out_of_sample?.profit_factor ?? 0}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right tabular-nums text-red-400 font-semibold">
                      {res.out_of_sample?.max_drawdown ?? 0}R
                    </TableCell>
                  </TableRow>,
                ])
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-8">
      {renderTable("Bitcoin (Exness BTCUSD)", "BTCUSD", btcResults)}
      {renderTable("Gold (Exness XAUUSD)", "XAUUSD", xauResults)}

      {/* Limitation Notice */}
      <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-4 text-xs text-zinc-400 space-y-1">
        <span className="font-semibold text-zinc-300 block">
          Backtest Methodology & Limitation
        </span>
        <p className="leading-relaxed">
          Backtests strictly evaluate candle-based triggers on 15m candle closes with simulated entry fills at the next candle open, incorporating fee and slippage on both entry and exit. A strategy is only enabled if out-of-sample trades ≥ 30, expectancy &gt; 0, and profit factor ≥ 1.2.
        </p>
        <p className="leading-relaxed text-zinc-500 pt-1">
          * Note: Bybit public history does not provide historical orderbook depth, taker flow, or liquidation history. Consequently, the liquidity layer cannot be backtested and functions exclusively as a live confirmation layer.
        </p>
      </div>

      {/* Live Signal Results Table */}
      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardHeader className="pb-3 border-b border-zinc-800/80 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-zinc-200">
              Live Signal Forward-Test Log
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400">
              Real-time trade signals recorded live, incorporating the full liquidity confirmation layer.
            </CardDescription>
          </div>
          {signalsData.stats.count > 0 && (
            <div className="flex items-center space-x-2 text-[11px] font-mono">
              <span className="text-zinc-400">Trades: <strong className="text-zinc-200">{signalsData.stats.count}</strong></span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">Win Rate: <strong className="text-zinc-200">{signalsData.stats.winRate}%</strong></span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">Avg R: <strong className="text-zinc-200">{signalsData.stats.avgR}R</strong></span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">Expectancy: <strong className="text-zinc-200">{signalsData.stats.expectancy}R</strong></span>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800/80 hover:bg-transparent">
                <TableHead className="text-zinc-400 font-semibold text-xs">Symbol</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs">Strategy</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs">Side</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Entry</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Stop</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Target</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Score</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-center">Status</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-xs text-right">Outcome R</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signalsData.signals.length === 0 ? (
                <TableRow className="border-zinc-800/80">
                  <TableCell colSpan={9} className="text-center py-6 text-xs text-zinc-500">
                    Live signal outcomes will be logged here automatically as closed candles evaluate setups.
                  </TableCell>
                </TableRow>
              ) : (
                signalsData.signals.map((sig) => (
                  <TableRow key={sig.id} className="border-zinc-800/40 hover:bg-zinc-800/30">
                    <TableCell className="font-semibold text-zinc-200 text-xs">
                      {sig.symbol}
                    </TableCell>
                    <TableCell className="text-xs uppercase text-zinc-300 font-medium">
                      {sig.strategy}
                    </TableCell>
                    <TableCell className="text-xs font-semibold">
                      <span className={sig.side === "BUY" ? "text-green-400" : "text-red-400"}>
                        {sig.side}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-zinc-200 text-xs text-right tabular-nums">
                      {sig.entry.toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-red-400 text-xs text-right tabular-nums">
                      {sig.sl.toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-green-400 text-xs text-right tabular-nums">
                      {sig.tp.toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-zinc-200 text-xs text-right tabular-nums">
                      {sig.score}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={
                          sig.status === "open"
                            ? "border-sky-500/40 text-sky-400 bg-sky-500/10 text-[10px]"
                            : "border-zinc-700 text-zinc-400 bg-zinc-800/30 text-[10px]"
                        }
                      >
                        {sig.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right tabular-nums">
                      {sig.resultR !== null ? (
                        <span className={sig.resultR > 0 ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                          {sig.resultR > 0 ? `+${sig.resultR}R` : `${sig.resultR}R`}
                        </span>
                      ) : (
                        <span className="text-zinc-600">--</span>
                      )}
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

export default function BacktestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-100">
          Strategy Backtest Results
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Historical backtests across Donchian Trend, Bollinger Reversion, and Liquidity Sweep strategies.
        </p>
      </div>

      <Suspense fallback={<div className="text-xs text-zinc-500 py-6">Loading backtest results...</div>}>
        <BacktestData />
      </Suspense>
    </div>
  );
}
