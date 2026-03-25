import { supabase } from "./supabaseClient";

export type TgUserRecord = {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  email: string | null;
  phone: string | null;
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
    updated_at: new Date().toISOString(),
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
    .select(
      "id, telegram_id, telegram_username, telegram_first_name, telegram_last_name, last_name, first_name, middle_name, email, phone, registered_at, updated_at",
    )
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

export async function loadTelegramUserProfile(telegramId: number): Promise<TgUserRecord | null> {
  console.log("[tg-user-profile-load] request", { telegram_id: telegramId });
  const { data, error } = await supabase
    .from("tg_users")
    .select(
      "id, telegram_id, telegram_username, telegram_first_name, telegram_last_name, last_name, first_name, middle_name, email, phone, registered_at, updated_at",
    )
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (error) {
    console.log("[tg-user-profile-load] error", error);
    throw error;
  }

  console.log("[tg-user-profile-load] response", data);
  return (data as TgUserRecord | null) ?? null;
}

export type SaveTelegramUserProfilePayload = {
  telegramId: number;
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;
  email: string;
};

export async function saveTelegramUserProfile(payload: SaveTelegramUserProfilePayload): Promise<TgUserRecord> {
  const upsertRow = {
    telegram_id: payload.telegramId,
    last_name: payload.lastName.trim() || null,
    first_name: payload.firstName.trim() || null,
    middle_name: payload.middleName.trim() || null,
    phone: payload.phone.trim() || null,
    email: payload.email.trim() || null,
    updated_at: new Date().toISOString(),
  };

  console.log("[tg-user-profile-save] payload", upsertRow);

  const { data, error } = await supabase
    .from("tg_users")
    .upsert(upsertRow, { onConflict: "telegram_id" })
    .select(
      "id, telegram_id, telegram_username, telegram_first_name, telegram_last_name, last_name, first_name, middle_name, email, phone, registered_at, updated_at",
    )
    .single();

  if (error) {
    console.log("[tg-user-profile-save] error", error);
    throw error;
  }

  if (!data) {
    throw new Error("TG_USER_PROFILE_SAVE_EMPTY_RESULT");
  }

  console.log("[tg-user-profile-save] response", data);
  return data as TgUserRecord;
}
