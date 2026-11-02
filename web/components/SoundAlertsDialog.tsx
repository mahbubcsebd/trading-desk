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
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  Flame,
  ShieldAlert,
  Play,
  Check,
  Zap,
} from "lucide-react";
import {
  getAlertPreferences,
  saveAlertPreferences,
  playSetupAlert,
  playLiquiditySweepAlert,
  playNewsWarningAlert,
  requestDesktopNotificationPermission,
  type AlertPreferences,
} from "@/lib/audio-alerts";

interface SoundAlertsDialogProps {
  triggerButton?: React.ReactNode;
}

export default function SoundAlertsDialog({ triggerButton }: SoundAlertsDialogProps) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<AlertPreferences>(getAlertPreferences());
  const [browserPermission, setBrowserPermission] = useState<string>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserPermission(Notification.permission);
    }
  }, [open]);

  const updatePreference = <K extends keyof AlertPreferences>(key: K, value: AlertPreferences[K]) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    saveAlertPreferences(updated);
  };

  const handleRequestPermission = async () => {
    const granted = await requestDesktopNotificationPermission();
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserPermission(Notification.permission);
    }
    updatePreference("desktopAlertsEnabled", granted);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2.5 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-md transition-colors gap-1.5 cursor-pointer"
            title="Audio & Desktop Alert Settings"
          >
            {prefs.soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-zinc-500" />
            )}
            <span className="hidden sm:inline">Alerts</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[460px] bg-zinc-950 border-zinc-800 text-zinc-100 p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="p-4 px-5 bg-gradient-to-r from-zinc-900 to-[#10141D] border-b border-zinc-800/80">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                <span>Sound & Desktop Alert Manager</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-mono ${
                    prefs.soundEnabled
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      : "text-zinc-500 border-zinc-800"
                  }`}
                >
                  {prefs.soundEnabled ? "Active" : "Muted"}
                </Badge>
              </DialogTitle>
              <p className="text-[11px] text-zinc-400 font-sans">
                Real-time synthesized harmonic bells for trade setups and news warnings.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-4 text-xs font-sans max-h-[75vh] overflow-y-auto">
          {/* Master Sound Switch */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
            <div className="space-y-0.5">
              <span className="font-semibold text-zinc-200 block text-xs">Master Audio Sound</span>
              <span className="text-[11px] text-zinc-400">
                Play synthesized harmonic audio chimes on key market events
              </span>
            </div>
            <button
              type="button"
              onClick={() => updatePreference("soundEnabled", !prefs.soundEnabled)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                prefs.soundEnabled
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700"
              }`}
            >
              {prefs.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{prefs.soundEnabled ? "ON" : "MUTED"}</span>
            </button>
          </div>

          {/* Volume Slider */}
          {prefs.soundEnabled && (
            <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/60 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-300 font-medium">Alert Volume</span>
                <span className="font-mono text-emerald-400 font-bold">{Math.round(prefs.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={prefs.volume}
                onChange={(e) => updatePreference("volume", parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
              />
            </div>
          )}

          {/* Desktop Push Notification Setting */}
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="font-semibold text-zinc-200 block text-xs flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-cyan-400" />
                  Browser Desktop Notifications
                </span>
                <span className="text-[11px] text-zinc-400">
                  Receive system alerts even when viewing other tabs or apps
                </span>
              </div>

              {browserPermission === "granted" ? (
                <button
                  type="button"
                  onClick={() => updatePreference("desktopAlertsEnabled", !prefs.desktopAlertsEnabled)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer border ${
                    prefs.desktopAlertsEnabled
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700"
                  }`}
                >
                  {prefs.desktopAlertsEnabled ? "Enabled" : "Disabled"}
                </button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleRequestPermission}
                  className="h-7 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-semibold cursor-pointer"
                >
                  Grant Permission
                </Button>
              )}
            </div>
          </div>

          {/* Individual Event Audio Toggles */}
          <div className="space-y-2 pt-1 border-t border-zinc-800/80">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block">
              Active Trigger Alerts
            </span>

            {/* 1. Trade Setup Trigger */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60 text-xs">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="notifySetup"
                  checked={prefs.notifySetup}
                  onChange={(e) => updatePreference("notifySetup", e.target.checked)}
                  className="rounded border-zinc-700 accent-emerald-500 cursor-pointer"
                />
                <label htmlFor="notifySetup" className="cursor-pointer text-zinc-200 font-medium">
                  Trade Signals (BUY / SELL Breakouts)
                </label>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => playSetupAlert("BUY", prefs.volume)}
                  className="h-6 px-1.5 text-[10px] text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                  title="Test Buy Chime"
                >
                  <Play className="w-2.5 h-2.5 mr-1 fill-current" /> Buy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => playSetupAlert("SELL", prefs.volume)}
                  className="h-6 px-1.5 text-[10px] text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                  title="Test Sell Chime"
                >
                  <Play className="w-2.5 h-2.5 mr-1 fill-current" /> Sell
                </Button>
              </div>
            </div>

            {/* 2. SMC Liquidity Sweep */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60 text-xs">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="notifySweep"
                  checked={prefs.notifySweep}
                  onChange={(e) => updatePreference("notifySweep", e.target.checked)}
                  className="rounded border-zinc-700 accent-amber-500 cursor-pointer"
                />
                <label htmlFor="notifySweep" className="cursor-pointer text-zinc-200 font-medium flex items-center gap-1">
                  <span>SMC Liquidity Sweep (Judas Swings)</span>
                  <Flame className="w-3 h-3 text-amber-400" />
                </label>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => playLiquiditySweepAlert(prefs.volume)}
                className="h-6 px-1.5 text-[10px] text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                title="Test Sweep Tone"
              >
                <Play className="w-2.5 h-2.5 mr-1 fill-current" /> Test
              </Button>
            </div>

            {/* 3. Forex Factory News Warning */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60 text-xs">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="notifyNews"
                  checked={prefs.notifyNews}
                  onChange={(e) => updatePreference("notifyNews", e.target.checked)}
                  className="rounded border-zinc-700 accent-rose-500 cursor-pointer"
                />
                <label htmlFor="notifyNews" className="cursor-pointer text-zinc-200 font-medium flex items-center gap-1">
                  <span>Economic News 15m Blackout Warning</span>
                  <ShieldAlert className="w-3 h-3 text-rose-400" />
                </label>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => playNewsWarningAlert(prefs.volume)}
                className="h-6 px-1.5 text-[10px] text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                title="Test News Chime"
              >
                <Play className="w-2.5 h-2.5 mr-1 fill-current" /> Test
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="p-3 px-5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 font-mono">
            Zero network latency • Web Audio Synthesizer
          </span>
          <Button
            size="sm"
            onClick={() => setOpen(false)}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs h-7 px-3 cursor-pointer"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

