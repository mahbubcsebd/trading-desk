"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Clock,
  Flame,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Globe,
  Calendar,
  ChevronDown,
  ChevronUp,
  Radio,
  Zap,
} from "lucide-react";
import type { MacroData, SmcAnalysisData } from "@/lib/engine";

interface SessionHudBarProps {
  macro?: MacroData | null;
  smc?: SmcAnalysisData | null;
}

interface SessionInfo {
  name: string;
  flag: string;
  openUtc: number; // in minutes from midnight
  closeUtc: number; // in minutes from midnight
}

const TRADING_SESSIONS: SessionInfo[] = [
  { name: "Tokyo", flag: "🇯🇵", openUtc: 0, closeUtc: 9 * 60 }, // 00:00 - 09:00 UTC
  { name: "London", flag: "🇬🇧", openUtc: 7 * 60, closeUtc: 16 * 60 }, // 07:00 - 16:00 UTC
  { name: "New York", flag: "🇺🇸", openUtc: 12 * 60, closeUtc: 21 * 60 }, // 12:00 - 21:00 UTC
  { name: "Sydney", flag: "🇦🇺", openUtc: 21 * 60, closeUtc: 6 * 60 }, // 21:00 - 06:00 UTC (wraps)
];

interface KillzoneInfo {
  name: string;
  openUtc: number;
  closeUtc: number;
}

const ICT_KILLZONES: KillzoneInfo[] = [
  { name: "Asian KZ", openUtc: 0, closeUtc: 4 * 60 }, // 00:00 - 04:00 UTC
  { name: "London Open KZ", openUtc: 7 * 60, closeUtc: 10 * 60 }, // 07:00 - 10:00 UTC
  { name: "New York Open KZ", openUtc: 12 * 60, closeUtc: 15 * 60 }, // 12:00 - 15:00 UTC
  { name: "London Close KZ", openUtc: 15 * 60, closeUtc: 17 * 60 }, // 15:00 - 17:00 UTC
];

export default function SessionHudBar({ macro, smc }: SessionHudBarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Current time breakdown in UTC
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const utcSeconds = now.getUTCSeconds();
  const currentUtcMinutes = utcHours * 60 + utcMinutes;

  const utcTimeString = `${String(utcHours).padStart(2, "0")}:${String(utcMinutes).padStart(2, "0")}:${String(
    utcSeconds
  ).padStart(2, "0")} UTC`;

  // Bangladesh Standard Time (BST = UTC+6)
  const bstHours = (utcHours + 6) % 24;
  const bstTimeString = `${String(bstHours).padStart(2, "0")}:${String(utcMinutes).padStart(2, "0")} BST`;

  // Active Market Sessions
  const sessionStatuses = useMemo(() => {
    return TRADING_SESSIONS.map((s) => {
      let isOpen = false;
      if (s.openUtc < s.closeUtc) {
        isOpen = currentUtcMinutes >= s.openUtc && currentUtcMinutes < s.closeUtc;
      } else {
        // Wraps over midnight (e.g. Sydney)
        isOpen = currentUtcMinutes >= s.openUtc || currentUtcMinutes < s.closeUtc;
      }
      return { ...s, isOpen };
    });
  }, [currentUtcMinutes]);

  // Active ICT Killzone and Time Remaining
  const currentKillzoneStatus = useMemo(() => {
    for (const kz of ICT_KILLZONES) {
      if (currentUtcMinutes >= kz.openUtc && currentUtcMinutes < kz.closeUtc) {
        const remainingMinutes = kz.closeUtc - currentUtcMinutes - 1;
        const remainingSeconds = 59 - utcSeconds;
        return {
          isActive: true,
          name: kz.name,
          timeLeft: `${remainingMinutes}m ${remainingSeconds}s`,
          phase: smc?.killzone?.phase || "Expansion / Manipulation",
        };
      }
    }

    // Find next killzone
    let nextKz: KillzoneInfo | null = null;
    let minDiff = 24 * 60;
    for (const kz of ICT_KILLZONES) {
      let diff = kz.openUtc - currentUtcMinutes;
      if (diff <= 0) diff += 24 * 60;
      if (diff < minDiff) {
        minDiff = diff;
        nextKz = kz;
      }
    }

    const nextHours = Math.floor(minDiff / 60);
    const nextMins = minDiff % 60;
    return {
      isActive: false,
      name: nextKz?.name || "Killzone",
      timeLeft: `${nextHours > 0 ? `${nextHours}h ` : ""}${nextMins}m`,
      phase: "Standard Ambient Trading",
    };
  }, [currentUtcMinutes, utcSeconds, smc?.killzone?.phase]);

  // Next High/Med Impact News Event and countdown
  const nextNews = macro?.news?.nextEvent;
  const isNewsWindow = macro?.news?.isNewsWindow || false;
  const newsWarning = macro?.news?.warning;

  // DXY Dollar Index
  const dxy = macro?.dxy;
  const isDxyBullish = dxy?.bias === "bull";

  return (
    <div className="w-full rounded-xl bg-gradient-to-r from-zinc-950 via-[#0C1017] to-zinc-950 border border-zinc-800/80 shadow-xl overflow-hidden transition-all select-none">
      {/* Primary Status Strip (Always Visible) */}
      <div className="px-3.5 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-800/60 text-xs">
        {/* Left: Clocks & Active Sessions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-zinc-900/90 border border-zinc-800 font-mono text-zinc-200">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-zinc-100">{utcTimeString}</span>
            <span className="text-zinc-500 text-[10px]">({bstTimeString})</span>
          </div>

          {/* Session Badges */}
          <div className="flex items-center space-x-1.5">
            {sessionStatuses.map((s) => (
              <span
                key={s.name}
                className={`px-2 py-0.5 rounded text-[11px] font-mono flex items-center space-x-1 transition-all ${
                  s.isOpen
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                    : "bg-zinc-900/40 text-zinc-500 border border-zinc-800/60 hidden sm:inline-flex"
                }`}
                title={`${s.name} Session (${Math.floor(s.openUtc / 60)}:00 - ${Math.floor(s.closeUtc / 60)}:00 UTC)`}
              >
                <span>{s.flag}</span>
                <span className="font-medium">{s.name}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${s.isOpen ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`}
                />
              </span>
            ))}
          </div>
        </div>

        {/* Center: Live ICT Killzone Indicator */}
        <div className="flex items-center space-x-2">
          {currentKillzoneStatus.isActive ? (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono shadow-[0_0_12px_rgba(245,158,11,0.25)]">
              <Flame className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
              <span className="font-bold">{currentKillzoneStatus.name}: ACTIVE</span>
              <span className="text-zinc-400 text-[10px] hidden md:inline">({currentKillzoneStatus.timeLeft})</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-zinc-900/60 border border-zinc-800 text-zinc-400 text-[11px] font-mono hidden md:flex">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              <span>Next KZ: {currentKillzoneStatus.name} ({currentKillzoneStatus.timeLeft})</span>
            </div>
          )}
        </div>

        {/* Right: News Risk State & Toggle */}
        <div className="flex items-center space-x-2 ml-auto">
          {isNewsWindow ? (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-300 font-semibold text-[11px] animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>VOLATILITY WINDOW ACTIVE</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium hidden sm:flex">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>SPREAD SAFE</span>
            </div>
          )}

          {/* Expand / Collapse Button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
            title={isExpanded ? "Collapse HUD Details" : "Expand Institutional HUD"}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Multi-Column Institutional HUD Details */}
      {isExpanded && (
        <div className="p-3 px-4 bg-zinc-950/60 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs border-t border-zinc-800/40">
          {/* Column 1: ICT Killzones & Session Architecture */}
          <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60 space-y-1.5">
            <div className="flex items-center justify-between text-zinc-400 text-[11px] font-semibold border-b border-zinc-800/60 pb-1">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                Session Architecture
              </span>
              <span className="font-mono text-[10px] text-cyan-300">
                {currentKillzoneStatus.isActive ? "Killzone Phase" : "Ambient Phase"}
              </span>
            </div>

            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex items-center justify-between text-zinc-300">
                <span className="text-zinc-400">Active State:</span>
                <span className={currentKillzoneStatus.isActive ? "text-amber-400 font-semibold" : "text-zinc-400"}>
                  {currentKillzoneStatus.name} {currentKillzoneStatus.isActive ? `(${currentKillzoneStatus.timeLeft})` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span className="text-zinc-400">AMD Cycle:</span>
                <span className="text-zinc-200">{currentKillzoneStatus.phase}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span className="text-zinc-400">London Open:</span>
                <span className="text-zinc-400">07:00 - 10:00 UTC (13:00 BST)</span>
              </div>
              <div className="flex items-center justify-between text-zinc-300">
                <span className="text-zinc-400">New York Open:</span>
                <span className="text-zinc-400">12:00 - 15:00 UTC (18:00 BST)</span>
              </div>
            </div>
          </div>

          {/* Column 2: Forex Factory Economic News Countdown */}
          <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60 space-y-1.5">
            <div className="flex items-center justify-between text-zinc-400 text-[11px] font-semibold border-b border-zinc-800/60 pb-1">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Calendar className="w-3.5 h-3.5 text-rose-400" />
                Economic Calendar Radar
              </span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                  isNewsWindow ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/15 text-emerald-300"
                }`}
              >
                {isNewsWindow ? "SPREAD ALERT" : "SAFE WINDOW"}
              </span>
            </div>

            {nextNews ? (
              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Next Event:</span>
                  <span className="text-zinc-100 font-semibold truncate max-w-[180px]" title={nextNews.title}>
                    {nextNews.title}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Time Until:</span>
                  <span
                    className={`font-bold ${
                      nextNews.minutesUntil <= 30
                        ? "text-rose-400 animate-pulse"
                        : nextNews.minutesUntil <= 60
                        ? "text-amber-400"
                        : "text-zinc-300"
                    }`}
                  >
                    in {Math.floor(nextNews.minutesUntil / 60)}h {nextNews.minutesUntil % 60}m ({nextNews.timeString})
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-zinc-400">Impact Rating:</span>
                  <span
                    className={`px-1.5 rounded uppercase font-bold text-[9px] ${
                      nextNews.impact === "High"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {nextNews.impact} Impact
                  </span>
                </div>
                {newsWarning && (
                  <p className="text-[10px] text-amber-300/90 font-sans leading-tight pt-0.5">{newsWarning}</p>
                )}
              </div>
            ) : (
              <div className="py-2 text-center text-zinc-500 font-mono text-[11px]">
                No imminent USD high-impact news scheduled for today.
              </div>
            )}
          </div>

          {/* Column 3: US Dollar Index (DXY) Correlation & Bias */}
          <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60 space-y-1.5">
            <div className="flex items-center justify-between text-zinc-400 text-[11px] font-semibold border-b border-zinc-800/60 pb-1">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                US Dollar Index (DXY) Bias
              </span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                  isDxyBullish
                    ? "bg-emerald-500/20 text-emerald-300"
                    : dxy?.bias === "bear"
                    ? "bg-rose-500/20 text-rose-300"
                    : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {dxy?.bias ? dxy.bias.toUpperCase() : "NEUTRAL"}
              </span>
            </div>

            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">DXY Price:</span>
                <span className="text-zinc-100 font-semibold flex items-center gap-1">
                  ${dxy?.price ? dxy.price.toFixed(2) : "101.96"}
                  <span
                    className={`text-[10px] ${
                      (dxy?.change24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    ({(dxy?.change24h ?? 0) >= 0 ? "+" : ""}
                    {dxy?.change24h ? dxy.change24h.toFixed(2) : "0.00"}%)
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Gold Correlation:</span>
                <span
                  className={`text-[10px] font-sans font-medium ${
                    isDxyBullish
                      ? "text-rose-400"
                      : dxy?.bias === "bear"
                      ? "text-emerald-400"
                      : "text-zinc-400"
                  }`}
                >
                  {dxy?.goldImpact || "Inverse Dollar Pressure"}
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-400 text-[10px]">
                <span>Macro Alignment:</span>
                <span className="font-semibold text-zinc-300">
                  {macro?.mtf?.alignment || "Consolidation"} ({macro?.mtf?.score || 0}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

