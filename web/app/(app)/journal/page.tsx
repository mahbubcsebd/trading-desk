import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function JournalPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-100">
          Trading Journal
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Log trades, compute R-multiples, and track daily drawdown limits.
        </p>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-zinc-200">
            Journal Records
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400">
            Manual trade entry form and metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500">
            Trading journal form and performance tiles will be implemented in Phase P7.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
