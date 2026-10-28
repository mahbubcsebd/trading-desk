"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon } from "lucide-react";
import { saveSettingsAction } from "@/app/actions";
import type { SettingsData } from "@/lib/engine";

interface SettingsDialogProps {
  initialSettings: SettingsData;
}

export default function SettingsDialog({ initialSettings }: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(initialSettings.balance.toString());
  const [riskPct, setRiskPct] = useState(initialSettings.risk_pct.toString());
  const [dailyLimitPct, setDailyLimitPct] = useState(initialSettings.daily_limit_pct.toString());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    try {
      await saveSettingsAction({
        balance: parseFloat(balance) || 10000,
        risk_pct: parseFloat(riskPct) || 1.0,
        daily_limit_pct: parseFloat(dailyLimitPct) || 3.0,
      });
      setSaved(true);
      setTimeout(() => {
        setOpen(false);
        setSaved(false);
      }, 600);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 flex items-center space-x-1.5"
          />
        }
      >
        <SettingsIcon className="w-4 h-4" />
        <span className="text-xs hidden sm:inline">Settings</span>
      </DialogTrigger>
      <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-zinc-100">
            Risk & Account Settings
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="balance" className="text-xs font-medium text-zinc-300">
              Account Balance ($ USD)
            </Label>
            <Input
              id="balance"
              type="number"
              step="any"
              min="1"
              value={balance}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBalance(e.target.value)}
              className="border-zinc-700 bg-zinc-950 font-mono text-zinc-100 text-xs"
              required
            />
            <p className="text-[11px] text-zinc-500">
              Used to calculate exact dollar risk and position quantity.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="riskPct" className="text-xs font-medium text-zinc-300">
              Risk Per Trade (% of Balance)
            </Label>
            <Input
              id="riskPct"
              type="number"
              step="0.1"
              min="0.1"
              max="20"
              value={riskPct}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRiskPct(e.target.value)}
              className="border-zinc-700 bg-zinc-950 font-mono text-zinc-100 text-xs"
              required
            />
            <p className="text-[11px] text-zinc-500">
              Default is 1.0% ($100 on a $10,000 account).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dailyLimitPct" className="text-xs font-medium text-zinc-300">
              Daily Loss Limit (% of Balance)
            </Label>
            <Input
              id="dailyLimitPct"
              type="number"
              step="0.5"
              min="0.5"
              max="50"
              value={dailyLimitPct}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDailyLimitPct(e.target.value)}
              className="border-zinc-700 bg-zinc-950 font-mono text-zinc-100 text-xs"
              required
            />
            <p className="text-[11px] text-zinc-500">
              When today's realized loss reaches this threshold, new setups lock.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="text-xs text-zinc-400"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="text-xs bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
