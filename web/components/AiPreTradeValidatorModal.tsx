"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Layers,
  Compass,
  Zap,
} from "lucide-react";

interface ValidationChecklistItem {
  pillar: string;
  status: "PASS" | "WARN" | "FAIL";
  note: string;
}

interface ValidationResult {
  verdict: "GO" | "GO_WITH_CAUTION" | "NO_GO";
  verdictTitle: string;
  confidenceScore: number;
  recommendedRiskPct: number;
  recommendedLot: string;
  checklist: ValidationChecklistItem[];
  keyStrengths: string[];
  edgeRisks: string[];
  invalidationLevel: number;
  mentorNoteBengali: string;
}

interface AiPreTradeValidatorModalProps {
  symbol: string;
  side: "BUY" | "SELL";
  entry: number;
  sl: number;
  tp: number;
  qty?: number;
  balance?: number;
  riskPct?: number;
  triggerButton?: React.ReactNode;
  onProceedToOrder?: () => void;
}

export default function AiPreTradeValidatorModal({
  symbol,
  side,
  entry,
  sl,
  tp,
  qty = 0.01,
  balance = 10000,
  riskPct = 1.0,
  triggerButton,
  onProceedToOrder,
}: AiPreTradeValidatorModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runValidation = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trade/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          entry,
          sl,
          tp,
          qty,
          balance,
          riskPct,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to validate trade");
      }

      const json = await res.json();
      setResult(json);
    } catch (err: any) {
      console.error("AI Validation error:", err);
      setError(err.message || "An unexpected error occurred during AI validation");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !result && !loading) {
      runValidation();
    }
  };

  const slDist = Math.abs(entry - sl);
  const tpDist = Math.abs(tp - entry);
  const rr = slDist > 0 ? (tpDist / slDist).toFixed(2) : "2.0";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button
            size="sm"
            className="h-8 px-3 text-xs font-semibold bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:via-indigo-500 hover:to-cyan-500 text-white gap-1.5 shadow-md shadow-purple-900/30 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Validate with AI</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl bg-zinc-950/95 border-zinc-800 text-zinc-100 p-0 overflow-hidden shadow-2xl backdrop-blur-2xl">
        <DialogHeader className="p-5 pb-3 border-b border-zinc-800/80 bg-zinc-900/40">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold flex items-center gap-2">
                  Institutional AI Pre-Trade Validator
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Gemini Flash Head Risk Officer
                  </span>
                </DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Live Confluence Matrix, Judas Radar, Macro News & PD Array Audit
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={runValidation}
              disabled={loading}
              className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100 gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin text-purple-400" : ""}`} />
              <span className="text-[11px]">Re-Audit</span>
            </Button>
          </div>

          {/* Trade Parameters Ribbon */}
          <div className="flex flex-wrap items-center gap-3 pt-3 text-xs font-mono">
            <span className="text-zinc-400">
              Pair: <strong className="text-zinc-100">{symbol}</strong>
            </span>
            <span className="text-zinc-400">
              Side:{" "}
              <strong className={side === "BUY" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                {side}
              </strong>
            </span>
            <span className="text-zinc-400">
              Entry: <strong className="text-zinc-100">{entry}</strong>
            </span>
            <span className="text-zinc-400">
              SL: <strong className="text-rose-400">{sl}</strong>
            </span>
            <span className="text-zinc-400">
              TP: <strong className="text-emerald-400">{tp}</strong>
            </span>
            <span className="text-zinc-400">
              R:R: <strong className="text-cyan-400">1:{rr}</strong>
            </span>
          </div>
        </DialogHeader>

        <div className="p-5 max-h-[72vh] overflow-y-auto space-y-4">
          {/* Loading State */}
          {loading && (
            <div className="py-12 text-center space-y-3">
              <div className="inline-flex p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 animate-pulse">
                <RefreshCw className="w-6 h-6 text-purple-400 animate-spin" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-zinc-200">
                  Auditing Orderflow Across 4 Timeframes...
                </h4>
                <p className="text-[11px] text-zinc-400 font-mono">
                  Checking HTF Matrix • Asian Judas Sweep • Discount/Premium • Red Folder News
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Validation Encountered an Issue</span>
              </div>
              <p>{error}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={runValidation}
                className="h-7 text-xs border-rose-500/40 hover:bg-rose-950/60 text-rose-200 cursor-pointer"
              >
                Retry Validation
              </Button>
            </div>
          )}

          {/* Result Card */}
          {result && !loading && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* 1. Main Verdict Banner */}
              <div
                className={`p-4 rounded-xl border backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  result.verdict === "GO"
                    ? "bg-emerald-950/40 border-emerald-500/50 shadow-[0_0_25px_rgba(16,185,129,0.25)]"
                    : result.verdict === "GO_WITH_CAUTION"
                    ? "bg-amber-950/40 border-amber-500/50 shadow-[0_0_25px_rgba(245,158,11,0.25)]"
                    : "bg-rose-950/40 border-rose-500/50 shadow-[0_0_25px_rgba(244,63,94,0.25)]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                      result.verdict === "GO"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                        : result.verdict === "GO_WITH_CAUTION"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                    }`}
                  >
                    {result.verdict === "GO" ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : result.verdict === "GO_WITH_CAUTION" ? (
                      <AlertTriangle className="w-5 h-5" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-black tracking-wider uppercase ${
                          result.verdict === "GO"
                            ? "bg-emerald-500 text-zinc-950"
                            : result.verdict === "GO_WITH_CAUTION"
                            ? "bg-amber-500 text-zinc-950"
                            : "bg-rose-500 text-white"
                        }`}
                      >
                        {result.verdict.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-zinc-400 font-mono">
                        Score: <strong className="text-zinc-100">{result.confidenceScore}</strong> / 10
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-zinc-100 mt-1">
                      {result.verdictTitle}
                    </h3>
                    <p className="text-[11px] text-zinc-300 mt-0.5 font-mono">
                      Recommended Risk: <strong className="text-cyan-400">{result.recommendedRiskPct}%</strong> ({result.recommendedLot})
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-center">
                    <span className="text-[9px] text-zinc-500 block uppercase font-mono">Invalidation</span>
                    <span className="text-xs font-bold text-rose-400 font-mono">
                      {result.invalidationLevel}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. 5-Pillar Confluence Checklist */}
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-2">
                <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  Institutional 5-Pillar Verification Checklist
                </h4>

                <div className="divide-y divide-zinc-800/60">
                  {result.checklist.map((item, idx) => (
                    <div key={idx} className="py-2 flex items-start justify-between gap-3 text-xs">
                      <div className="space-y-0.5">
                        <span className="font-medium text-zinc-200 block">{item.pillar}</span>
                        <span className="text-[11px] text-zinc-400 block font-sans">{item.note}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono shrink-0 ${
                          item.status === "PASS"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : item.status === "WARN"
                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Strengths vs Edge Risks (What could go wrong) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Strengths */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3 space-y-1.5">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" />
                    Key Confluence Strengths
                  </span>
                  <ul className="text-xs text-zinc-300 space-y-1 font-sans">
                    {result.keyStrengths.map((str, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-emerald-400 shrink-0">•</span>
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Edge Risks */}
                <div className="rounded-xl border border-rose-500/20 bg-rose-950/10 p-3 space-y-1.5">
                  <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Edge Risks & Invalidation
                  </span>
                  <ul className="text-xs text-zinc-300 space-y-1 font-sans">
                    {result.edgeRisks.map((risk, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-rose-400 shrink-0">•</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* 4. Actionable Mentor Coaching in Bengali */}
              <div className="p-3.5 rounded-xl border border-cyan-500/30 bg-cyan-950/15 space-y-1">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  Institutional Mentor Guidance (বাংলায় মেন্টর পরামর্শ)
                </span>
                <p className="text-xs text-zinc-200 leading-relaxed font-sans">
                  {result.mentorNoteBengali}
                </p>
              </div>

              {/* 5. Bottom Action */}
              <div className="pt-2 flex items-center justify-between gap-3 border-t border-zinc-800">
                <span className="text-[10px] text-zinc-500 font-mono">
                  Strict discipline required • Never exceed recommended risk
                </span>
                {result.verdict !== "NO_GO" && onProceedToOrder && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setOpen(false);
                      onProceedToOrder();
                    }}
                    className="h-8 px-4 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5 cursor-pointer shadow-md"
                  >
                    <span>Proceed to Order Execution</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
