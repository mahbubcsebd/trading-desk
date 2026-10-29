"use server";

import { revalidatePath } from "next/cache";
import {
  updateSettings,
  addJournalTrade,
  deleteJournalTrade,
  getSettings,
  testTelegram,
  type SettingsData,
} from "@/lib/engine";

export async function fetchSettingsAction(): Promise<SettingsData> {
  return await getSettings();
}

export async function saveSettingsAction(data: {
  balance: number;
  risk_pct: number;
  daily_limit_pct: number;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
}) {
  await updateSettings(data);
  revalidatePath("/");
  revalidatePath("/journal");
  return { ok: true };
}

export async function testTelegramAction(token?: string, chatId?: string) {
  return await testTelegram(token, chatId);
}

export async function addJournalTradeAction(data: {
  symbol: string;
  side: string;
  entry: number;
  exit: number;
  sl: number;
  qty: number;
  notes?: string;
}) {
  await addJournalTrade(data);
  revalidatePath("/journal");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteJournalTradeAction(tradeId: number) {
  await deleteJournalTrade(tradeId);
  revalidatePath("/journal");
  revalidatePath("/");
  return { ok: true };
}
