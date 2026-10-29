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
import { saveSettingsAction, testTelegramAction } from "@/app/actions";
import type { SettingsData } from "@/lib/engine";

interface SettingsDialogProps {
  initialSettings: SettingsData;
}

export default function SettingsDialog({ initialSettings }: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(initialSettings.balance.toString());
  const [riskPct, setRiskPct] = useState(initialSettings.risk_pct.toString());
  const [dailyLimitPct, setDailyLimitPct] = useState(initialSettings.daily_limit_pct.toString());
  const [telegramToken, setTelegramToken] = useState(initialSettings.telegram_bot_token || "");
  const [telegramChatId, setTelegramChatId] = useState(initialSettings.telegram_chat_id || "");
  const [geminiKey, setGeminiKey] = useState(initialSettings.gemini_api_key || "");
  const [testingTg, setTestingTg] = useState(false);
  const [tgResult, setTgResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleTestTelegram = async () => {
    setTestingTg(true);
    setTgResult(null);
    try {
      const res = await testTelegramAction(telegramToken, telegramChatId);
      setTgResult({ ok: res.ok, msg: res.message });
    } catch (e: any) {
      setTgResult({ ok: false, msg: e?.message || "Failed to reach engine" });
    } finally {
      setTestingTg(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    try {
      await saveSettingsAction({
        balance: parseFloat(balance) || 10000,
        risk_pct: parseFloat(riskPct) || 1.0,
        daily_limit_pct: parseFloat(dailyLimitPct) || 3.0,
        telegram_bot_token: telegramToken,
        telegram_chat_id: telegramChatId,
        gemini_api_key: geminiKey,
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

          {/* Telegram Instant Push Alerts */}
          <div className="pt-3 border-t border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                <span>Telegram Signal Alerts</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">Instant Push</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="telegramToken" className="text-xs font-medium text-zinc-300">
                Telegram Bot Token
              </Label>
              <Input
                id="telegramToken"
                type="text"
                placeholder="123456789:ABCdefGhIJKlmNoPQRstuVWXyz"
                value={telegramToken}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTelegramToken(e.target.value)}
                className="border-zinc-700 bg-zinc-950 font-mono text-zinc-100 text-xs"
              />
              <p className="text-[10px] text-zinc-500">
                Obtain free from Telegram @BotFather.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="telegramChatId" className="text-xs font-medium text-zinc-300">
                Telegram Chat ID
              </Label>
              <Input
                id="telegramChatId"
                type="text"
                placeholder="123456789 or @your_channel"
                value={telegramChatId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTelegramChatId(e.target.value)}
                className="border-zinc-700 bg-zinc-950 font-mono text-zinc-100 text-xs"
              />
              <p className="text-[10px] text-zinc-500">
                Your personal Chat ID (check with @userinfobot) or channel handle.
              </p>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestTelegram}
                disabled={testingTg || !telegramToken || !telegramChatId}
                className="text-xs border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
              >
                {testingTg ? "Sending Test..." : "Send Test Alert"}
              </Button>
              {tgResult && (
                <span
                  className={`text-[11px] font-mono ${
                    tgResult.ok ? "text-emerald-400 font-bold" : "text-rose-400 font-medium"
                  }`}
                >
                  {tgResult.msg}
                </span>
              )}
            </div>
          </div>

          {/* Google Gemini AI Copilot Integration */}
          <div className="pt-3 border-t border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>Google Gemini AI Copilot</span>
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-cyan-400 hover:underline"
              >
                Get Free API Key ↗
              </a>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="geminiKey" className="text-xs font-medium text-zinc-300">
                Gemini API Key
              </Label>
              <Input
                id="geminiKey"
                type="password"
                placeholder="AIzaSy..."
                value={geminiKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGeminiKey(e.target.value)}
                className="border-zinc-700 bg-zinc-950 font-mono text-zinc-100 text-xs"
              />
              <p className="text-[10px] text-zinc-500">
                100% Free via Google AI Studio. Powers live market analysis & AI mentor chat.
              </p>
            </div>
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
