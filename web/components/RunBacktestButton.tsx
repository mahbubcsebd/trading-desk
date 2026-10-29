"use client";

import React, { useState } from "react";
import { runBacktestAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Play, Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface RunBacktestButtonProps {
  symbol: string;
  label?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export function RunBacktestButton({ symbol, label = "Run Backtest", size = "sm" }: RunBacktestButtonProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleRun = async () => {
    setLoading(true);
    setSuccess(false);
    try {
      const res = await runBacktestAction(symbol);
      if (res.ok) {
        setSuccess(true);
        router.refresh();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        alert(`Backtest failed: ${res.error}`);
      }
    } catch (e: unknown) {
      alert(`Error running backtest: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size={size}
      variant="outline"
      onClick={handleRun}
      disabled={loading}
      className="border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 text-xs gap-1.5 h-8 font-medium cursor-pointer transition-all"
    >
      {loading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
          <span>Computing 3,000 Bars...</span>
        </>
      ) : success ? (
        <>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-emerald-400">Completed!</span>
        </>
      ) : (
        <>
          <Play className="w-3.5 h-3.5 fill-current text-sky-400" />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
}
