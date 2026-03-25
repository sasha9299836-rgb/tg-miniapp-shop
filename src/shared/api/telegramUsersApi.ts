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
  const upsertRow = {
    telegram_id: payload.telegramId,
    telegram_username: payload.username ?? null,
    telegram_first_name: payload.firstName ?? null,
    telegram_last_name: payload.lastName ?? null,
  };

  console.log("[tg-user-upsert] request", {
    supabaseUrl,
    ...upsertRow,
  });

  const { data, error } = await supabase.rpc("tg_upsert_telegram_user", {
    p_telegram_id: payload.telegramId,
    p_telegram_username: payload.username ?? null,
    p_telegram_first_name: payload.firstName ?? null,
    p_telegram_last_name: payload.lastName ?? null,
  });

  if (error) {
    console.log("[tg-user-upsert] rpc error", error);
  } else {
    const rpcRow = Array.isArray(data) ? (data[0] as TgUserRecord | undefined) : (data as TgUserRecord | null);
    if (rpcRow) {
      console.log("[tg-user-upsert] rpc success", rpcRow);
      return rpcRow;
    }
    console.log("[tg-user-upsert] rpc empty result", data);
  }

  const { data: directData, error: directError } = await supabase
    .from("tg_users")
    .upsert(upsertRow, { onConflict: "telegram_id" })
    .select("id, telegram_id, telegram_username, telegram_first_name, telegram_last_name, registered_at, updated_at")
    .single();

  if (directError) {
    console.log("[tg-user-upsert] direct upsert error", directError);
    throw directError;
  }

  if (!directData) {
    console.log("[tg-user-upsert] direct upsert empty result", directData);
    throw new Error("TG_USER_UPSERT_EMPTY_RESULT");
  }

  console.log("[tg-user-upsert] direct upsert success", directData);
  return directData as TgUserRecord;
}
