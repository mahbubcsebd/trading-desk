"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MacroData } from "@/lib/engine";

interface MacroNewsPanelProps {
  macro?: MacroData;
  symbol: string;
}

export default function MacroNewsPanel({ macro, symbol }: MacroNewsPanelProps) {
  if (!macro) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/60 shadow-md">
        <CardContent className="text-xs text-zinc-500 py-3 text-center">
          Loading Economic News & Macro Correlation...
        </CardContent>
      </Card>
    );
  }

  const { news, dxy, mtf } = macro;

  const dxyBiasColor =
    dxy.bias === "bear"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      : dxy.bias === "bull"
      ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
      : "text-zinc-400 bg-zinc-800 border-zinc-700";

  const mtfColor =
    mtf.score >= 100
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      : mtf.score >= 60
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
      : "text-zinc-400 bg-zinc-800 border-zinc-700";

  return (
    <div className="space-y-4">
      {/* High-Impact News Window Warning Banner */}
      {news.isNewsWindow && news.warning && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/50 shadow-lg text-rose-200 flex items-center justify-between animate-pulse">
          <div className="flex items-center space-x-2.5">
            <span className="h-3 w-3 rounded-full bg-rose-500 animate-ping" />
            <span className="font-bold text-xs uppercase tracking-wide">
              {news.warning}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase font-mono bg-rose-500/20 text-rose-300 border-rose-500/40">
            High Slippage Risk
          </Badge>
        </div>
      )}

      {/* 2-Column Institutional Deck: News Calendar vs DXY & MTF Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column (7 cols): Forex Factory USD Economic Calendar */}
        <Card className="lg:col-span-7 border-zinc-800 bg-zinc-900/70 shadow-lg backdrop-blur flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3 border-b border-zinc-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full bg-rose-400" />
                  <CardTitle className="text-xs uppercase tracking-wider text-zinc-200 font-bold">
                    Forex Factory Economic Radar (USD Macro Events)
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono text-zinc-400 border-zinc-700">
                  {news.upcomingCount} Upcoming Releases
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-2.5 pt-3 text-xs">
              {news.events.length === 0 ? (
                <div className="text-zinc-500 italic py-4 text-center">
                  No high or medium impact USD events scheduled today.
                </div>
              ) : (
                news.events.map((ev, idx) => {
                  const isHigh = ev.impact === "High";
                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border transition-colors flex items-center justify-between ${
                        ev.isPast
                          ? "bg-zinc-950/20 border-zinc-900 opacity-50"
                          : isHigh
                          ? "bg-rose-950/20 border-rose-500/30 text-zinc-200"
                          : "bg-zinc-950/50 border-zinc-800 text-zinc-300"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <Badge
                            variant="outline"
                            className={`text-[9px] font-mono uppercase px-1.5 py-0 ${
                              isHigh
                                ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            }`}
                          >
                            {ev.impact}
                          </Badge>
                          <span className="font-semibold text-xs text-zinc-100">{ev.title}</span>
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono space-x-3">
                          <span>Fcst: {ev.forecast}</span>
                          <span>Prev: {ev.previous}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-mono text-xs font-bold text-zinc-200">
                          {ev.timeString}
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {ev.isPast
                            ? "Completed"
                            : ev.minutesUntil === 0
                            ? "Due Now!"
                            : `in ${ev.minutesUntil}m`}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </div>

          <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/30 text-[10px] text-zinc-500">
            Institutional rule: Avoid placing new breakout orders within 15 minutes of Red-Folder USD news.
          </div>
        </Card>

        {/* Right Column (5 cols): DXY Correlation & Multi-Timeframe Alignment */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* DXY (Dollar Index) Correlation Box */}
          <Card className="border-zinc-800 bg-zinc-900/70 shadow-lg backdrop-blur">
            <CardHeader className="pb-2 border-b border-zinc-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  <CardTitle className="text-xs uppercase tracking-wider text-zinc-200 font-bold">
                    DXY Correlation (Dollar Index)
                  </CardTitle>
                </div>
                <Badge variant="outline" className={`text-[10px] font-mono uppercase px-2 py-0.5 border ${dxyBiasColor}`}>
                  DXY {dxy.bias}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase">US Dollar Index</div>
                  <div className="font-mono text-base font-bold text-zinc-100 mt-0.5">
                    ${dxy.price.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-zinc-500 uppercase">24h Shift</div>
                  <div
                    className={`font-mono text-xs font-bold mt-0.5 ${
                      dxy.change24h >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {dxy.change24h >= 0 ? "+" : ""}
                    {dxy.change24h}%
                  </div>
                </div>
              </div>

              <div className="p-2 rounded bg-zinc-950/60 border border-zinc-800 text-[11px] text-zinc-300 font-medium">
                {dxy.goldImpact}
              </div>
            </CardContent>
          </Card>

          {/* Multi-Timeframe Confluence Matrix */}
          <Card className="border-zinc-800 bg-zinc-900/70 shadow-lg backdrop-blur flex-1">
            <CardHeader className="pb-2 border-b border-zinc-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full bg-violet-400" />
                  <CardTitle className="text-xs uppercase tracking-wider text-zinc-200 font-bold">
                    Multi-Timeframe Matrix (MTF)
                  </CardTitle>
                </div>
                <Badge variant="outline" className={`text-[10px] font-mono uppercase px-2 py-0.5 border ${mtfColor}`}>
                  {mtf.alignment}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-3 space-y-1.5 text-xs">
              {[mtf.tf15m, mtf.tf1h, mtf.tf4h].map((t) => (
                <div
                  key={t.tf}
                  className="p-1.5 px-2.5 rounded bg-zinc-950/40 border border-zinc-800/60 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2 font-mono font-bold text-zinc-300 uppercase">
                    <span>{t.tf}</span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] font-mono px-1.5 py-0 ${
                        t.trend.includes("BULL")
                          ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                          : t.trend.includes("BEAR")
                          ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
                          : "text-zinc-400 border-zinc-700 bg-zinc-800"
                      }`}
                    >
                      {t.trend}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-zinc-400">{t.status}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

