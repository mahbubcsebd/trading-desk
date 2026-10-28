import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function BacktestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-100">
          Strategy Backtest Results
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          70% In-Sample / 30% Out-of-Sample validation on 15m candles.
        </p>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-zinc-200">
            Backtest Engine Status
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400">
            Run the backtest CLI via <code className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">uv run python -m app.backtest --symbol BTCUSDT</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500">
            Backtest data will be displayed here in Phase P5.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
