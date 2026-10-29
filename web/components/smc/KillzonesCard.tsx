"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SmcKillzone } from "@/lib/engine";

interface KillzonesCardProps {
  killzone?: SmcKillzone;
}

export default function KillzonesCard({ killzone }: KillzonesCardProps) {
  if (!killzone) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/60 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
            ICT Killzones (Time & Price)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-zinc-500 py-4">
          Tracking institutional market clocks...
        </CardContent>
      </Card>
    );
  }

  const sessions = [
    { name: "Asian Session", time: "00:00 - 06:00 UTC", role: "Accumulation / Range" },
    { name: "London Open Killzone", time: "07:00 - 10:00 UTC", role: "Manipulation / Judas Swing" },
    { name: "NY Open Killzone", time: "12:00 - 15:00 UTC", role: "Expansion / Peak Trend" },
    { name: "London Close", time: "15:00 - 17:00 UTC", role: "Distribution / Reversal" },
  ];

  return (
    <Card className="border-zinc-800 bg-zinc-900/70 shadow-lg backdrop-blur flex flex-col justify-between">
      <div>
        <CardHeader className="pb-3 border-b border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className={`h-2 w-2 rounded-full ${killzone.isKillzone ? "bg-amber-400 animate-ping" : "bg-zinc-500"}`} />
              <CardTitle className="text-xs uppercase tracking-wider text-zinc-200 font-bold">
                5. ICT Killzones & Session Timings
              </CardTitle>
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] font-mono px-2 py-0.5 border ${
                killzone.isKillzone
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700"
              }`}
            >
              {killzone.isKillzone ? "KILLZONE ACTIVE" : "Ambient Session"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-3 text-xs">
          {/* Active Session & Clock */}
          <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Current Market Clock</div>
              <div className="font-mono text-xs font-bold text-zinc-100 mt-0.5">
                {killzone.timeString}
              </div>
              <div className="text-[11px] text-cyan-400 font-medium mt-1">
                Active: {killzone.sessionName}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] text-zinc-500 uppercase">Power of 3 (AMD)</div>
              <Badge variant="outline" className="text-[10px] font-mono uppercase bg-zinc-800/80 text-zinc-200 border-zinc-700 mt-0.5">
                {killzone.phase}
              </Badge>
            </div>
          </div>

          {/* Session Overview Mini List */}
          <div className="space-y-1">
            {sessions.map((s) => {
              const isActive = killzone.sessionName.toLowerCase().includes(s.name.toLowerCase().split(" ")[0]);
              return (
                <div
                  key={s.name}
                  className={`p-1.5 px-2 rounded text-[11px] flex items-center justify-between transition-colors ${
                    isActive
                      ? "bg-amber-950/30 border border-amber-500/30 text-amber-200 font-medium"
                      : "bg-zinc-950/30 border border-zinc-900 text-zinc-400"
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                    <span>{s.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500">{s.time}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </div>

      <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-950/30 text-[10px] text-zinc-500">
        Institutional rule: Highest probability setups occur strictly inside London & New York Killzones.
      </div>
    </Card>
  );
}

