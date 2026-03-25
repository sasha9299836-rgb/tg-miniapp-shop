import { supabase } from "./supabaseClient";

export type TgUserRecord = {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  registered_at: string;
  updated_at: string;
};

type UpsertTelegramUserPayload = {
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export async function upsertTelegramUser(payload: UpsertTelegramUserPayload): Promise<TgUserRecord> {
  const supabaseUrl = String((import.meta as { env?: Record<string, unknown> }).env?.VITE_SUPABASE_URL ?? "").trim();
  console.log("[tg-user-upsert] request", {
    supabaseUrl,
    p_telegram_id: payload.telegramId,
    p_telegram_username: payload.username ?? null,
    p_telegram_first_name: payload.firstName ?? null,
    p_telegram_last_name: payload.lastName ?? null,
  });

  const { data, error } = await supabase.rpc("tg_upsert_telegram_user", {
    p_telegram_id: payload.telegramId,
    p_telegram_username: payload.username ?? null,
    p_telegram_first_name: payload.firstName ?? null,
    p_telegram_last_name: payload.lastName ?? null,
  });

  if (error) {
    console.log("[tg-user-upsert] error", error);
    throw error;
  }

  const row = Array.isArray(data) ? (data[0] as TgUserRecord | undefined) : (data as TgUserRecord | null);
  if (!row) {
    console.log("[tg-user-upsert] empty result", data);
    throw new Error("TG_USER_UPSERT_EMPTY_RESULT");
  }

  console.log("[tg-user-upsert] success", row);
  return row;
}
