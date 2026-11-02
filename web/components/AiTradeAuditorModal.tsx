"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Award,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Brain,
  ShieldCheck,
  Target,
  Clock,
  UserCheck,
} from "lucide-react";
import type { JournalTrade } from "@/lib/engine";
import { formatPriceWithUnit } from "@/lib/formatters";

export interface TradeAuditData {
  grade: "A+" | "A" | "B+" | "B" | "C" | "D" | "F";
  score: number;
  verdict: string;
  executionCategory: "DISCIPLINED" | "ACCEPTABLE" | "FOMO_RISK" | "RULE_BREAKER";
  checklist: {
    item: string;
    passed: boolean;
    note: string;
  }[];
  whatWentRight: string[];
  mistakesOrRisks: string[];
  mentorAdvice: string;
  psychologyInsight: string;
}

interface AiTradeAuditorModalProps {
  trade: JournalTrade;
  onAuditComplete?: (tradeId: number, audit: TradeAuditData) => void;
}

export default function AiTradeAuditorModal({
  trade,
  onAuditComplete,
}: AiTradeAuditorModalProps) {
  const [open, setOpen] = useState(false);
  const [audit, setAudit] = useState<TradeAuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = `tradedesk_audit_${trade.id}`;

  // Load cached audit if available
  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setAudit(parsed);
      }
    } catch {
      // ignore
    }
  }, [cacheKey]);

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/journal/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trade }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to generate AI trade audit");
      }

      setAudit(data.audit);
      localStorage.setItem(cacheKey, JSON.stringify(data.audit));
      if (onAuditComplete) {
        onAuditComplete(trade.id, data.audit);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during AI audit.");
    } finally {
      setLoading(false);
    }
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith("A")) {
      return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.25)]";
    }
    if (grade.startsWith("B")) {
      return "border-cyan-500/50 bg-cyan-500/10 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.25)]";
    }
    if (grade.startsWith("C")) {
      return "border-amber-500/50 bg-amber-500/10 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.25)]";
    }
    return "border-rose-500/50 bg-rose-500/10 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.25)]";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {audit ? (
          <Button
            size="sm"
            variant="outline"
            className={`h-7 px-2 text-[11px] font-mono font-bold rounded cursor-pointer gap-1.5 transition-all ${getGradeColor(
              audit.grade
            )}`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Grade {audit.grade}</span>
            <span className="text-[10px] opacity-75">({audit.score}%)</span>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-[11px] text-cyan-300 hover:text-cyan-200 hover:bg-cyan-950/40 border border-cyan-500/20 rounded font-medium gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>Audit Trade</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="p-5 pb-3 border-b border-zinc-800/80 bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <span>AI Trade Auditor & Post-Trade Review</span>
                  <Badge variant="outline" className="text-[10px] font-mono border-zinc-700 text-zinc-300">
                    {trade.symbol} • {trade.side}
                  </Badge>
                </DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Institutional Smart Money Concepts & Prop-Firm Risk Execution Analysis
                </p>
              </div>
            </div>

            {audit && (
              <div className="flex items-center gap-2">
                <div
                  className={`px-3 py-1 rounded-lg border font-black text-xl font-mono flex items-center gap-1.5 ${getGradeColor(
                    audit.grade
                  )}`}
                >
                  <span>{audit.grade}</span>
                </div>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="p-5 space-y-4 text-xs font-sans max-h-[75vh] overflow-y-auto">
          {/* Quick Trade Facts Header Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-lg bg-zinc-900/80 border border-zinc-800/80 text-xs font-mono">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Entry / Exit</span>
              <span className="text-zinc-200 font-bold">
                {formatPriceWithUnit(trade.entry, trade.symbol)} → {formatPriceWithUnit(trade.exit, trade.symbol)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Stop Loss</span>
              <span className="text-rose-400 font-bold">
                {formatPriceWithUnit(trade.sl, trade.symbol)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Realized PnL</span>
              <span className={trade.pnlUsd >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                {trade.pnlUsd >= 0 ? `+$${trade.pnlUsd.toLocaleString()}` : `-$${Math.abs(trade.pnlUsd).toLocaleString()}`}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block font-semibold">R-Multiple</span>
              <span className={trade.rMultiple >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                {trade.rMultiple >= 0 ? `+${trade.rMultiple}R` : `${trade.rMultiple}R`}
              </span>
            </div>
          </div>

          {/* Trader's Own Logged Notes */}
          {trade.notes && (
            <div className="p-2.5 rounded-md bg-zinc-900/40 border border-zinc-800/60 text-zinc-300 text-[11px]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block mb-0.5">
                Trader Notes:
              </span>
              <p className="italic text-zinc-300">&ldquo;{trade.notes}&rdquo;</p>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Empty / Not yet audited state */}
          {!audit && !loading && (
            <div className="py-8 text-center space-y-3 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20">
              <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-zinc-200">
                  Ready to Audit this Trade Execution
                </h4>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Our institutional Gemini auditor evaluates your entry timing, R:R discipline, stop-loss adherence, and psychological decision making.
                </p>
              </div>
              <Button
                onClick={runAudit}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs h-8 px-5 gap-2 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.3)]"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Launch Institutional AI Audit</span>
              </Button>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-200">
                  Auditing trade execution & institutional orderflow...
                </p>
                <p className="text-xs text-zinc-500 font-mono">
                  Evaluating SMC criteria, Killzone timing, and prop firm risk parameters
                </p>
              </div>
            </div>
          )}

          {/* Audit Results View */}
          {audit && !loading && (
            <div className="space-y-4">
              {/* Verdict Banner with Score Progress */}
              <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                      Lead Auditor Verdict
                    </span>
                    <h3 className="text-sm font-bold text-zinc-100">
                      {audit.verdict}
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black font-mono text-cyan-400">
                      {audit.score}/100
                    </span>
                    <span className="text-[10px] text-zinc-500 block">Discipline Score</span>
                  </div>
                </div>

                {/* Score bar */}
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      audit.score >= 85
                        ? "bg-emerald-500"
                        : audit.score >= 70
                        ? "bg-cyan-500"
                        : audit.score >= 50
                        ? "bg-amber-500"
                        : "bg-rose-500"
                    }`}
                    style={{ width: `${Math.max(5, audit.score)}%` }}
                  />
                </div>
              </div>

              {/* SMC Institutional Checklist */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block">
                  Institutional Checklist Audit
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {audit.checklist.map((chk, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                        chk.passed
                          ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-300"
                          : "bg-rose-950/20 border-rose-900/40 text-rose-300"
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span className="flex items-center gap-1.5">
                          {chk.passed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          )}
                          <span>{chk.item}</span>
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-mono ${
                            chk.passed
                              ? "border-emerald-500/40 text-emerald-400"
                              : "border-rose-500/40 text-rose-400"
                          }`}
                        >
                          {chk.passed ? "PASS" : "FAIL"}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-zinc-400 pl-5 leading-relaxed">
                        {chk.note}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Two Column Breakdown: Strengths vs Risks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* What went right */}
                <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-900/30 space-y-1.5">
                  <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>What Went Right (Strengths)</span>
                  </span>
                  <ul className="space-y-1 text-zinc-300 text-[11px]">
                    {audit.whatWentRight.map((w, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-emerald-400 mt-0.5">•</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Vulnerabilities / Mistakes */}
                <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-900/30 space-y-1.5">
                  <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Vulnerabilities & Fixes</span>
                  </span>
                  <ul className="space-y-1 text-zinc-300 text-[11px]">
                    {audit.mistakesOrRisks.map((m, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-amber-400 mt-0.5">•</span>
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Mentor Advice (Bengali) */}
              {audit.mentorAdvice && (
                <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-cyan-500/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-[11px]">
                    <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Senior Desk Mentor Advice:</span>
                  </div>
                  <p className="text-xs text-zinc-200 leading-relaxed font-sans">
                    {audit.mentorAdvice}
                  </p>
                </div>
              )}

              {/* Psychology & Emotion Insight (Bengali) */}
              {audit.psychologyInsight && (
                <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-800/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-purple-300 font-bold text-[11px]">
                    <Brain className="w-3.5 h-3.5 text-purple-400" />
                    <span>Trading Psychology & Discipline Review:</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                    {audit.psychologyInsight}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-3 px-5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between sm:justify-between">
          <span className="text-[10px] text-zinc-500 font-mono">
            Powered by Institutional Gemini Auditor
          </span>

          <div className="flex items-center gap-2">
            {audit && (
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={runAudit}
                className="h-8 text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800 cursor-pointer gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>Re-Analyze</span>
              </Button>
            )}

            <Button
              size="sm"
              onClick={() => setOpen(false)}
              className="h-8 text-xs bg-zinc-100 text-zinc-900 hover:bg-zinc-200 font-semibold cursor-pointer"
            >
              Done
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

