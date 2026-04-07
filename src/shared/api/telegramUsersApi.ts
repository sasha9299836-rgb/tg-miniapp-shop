import { TG_IDENTITY_REQUIRED_ERROR } from "../auth/tgUser";
import { ensureTelegramUserSessionToken } from "../auth/tgUserSession";
import { supabase } from "./supabaseClient";

export type TgUserRecord = {
  id: string;
  telegram_id: number;
  is_admin: boolean;
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
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

async function buildTelegramUserSessionHeaders(): Promise<Record<string, string>> {
  const token = await ensureTelegramUserSessionToken();
  if (!token) throw new Error(TG_IDENTITY_REQUIRED_ERROR);
  return { "x-tg-user-session": token };
}

function resolveUserFromResponse(payload: { ok?: boolean; user?: TgUserRecord | null } | null | undefined): TgUserRecord | null {
  if (!payload?.ok) throw new Error("TG_USERS_SECURE_FAILED");
  return (payload.user as TgUserRecord | null | undefined) ?? null;
}

export async function upsertTelegramUser(payload: UpsertTelegramUserPayload): Promise<TgUserRecord> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; user?: TgUserRecord | null }>(
    "tg_users_secure",
    {
      body: {
        mode: "bootstrap",
        telegram_username: payload.username ?? null,
        telegram_first_name: payload.firstName ?? null,
        telegram_last_name: payload.lastName ?? null,
      },
      headers: await buildTelegramUserSessionHeaders(),
    },
  );
  if (error) throw error;
  const user = resolveUserFromResponse(data);
  if (!user) throw new Error("TG_USER_UPSERT_EMPTY_RESULT");
  return user;
}

export async function loadTelegramUserProfile(): Promise<TgUserRecord | null> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; user?: TgUserRecord | null }>(
    "tg_users_secure",
    {
      body: { mode: "load_profile" },
      headers: await buildTelegramUserSessionHeaders(),
    },
  );
  if (error) throw error;
  return resolveUserFromResponse(data);
}

export type SaveTelegramUserProfilePayload = {
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;
  email: string;
};

export async function saveTelegramUserProfile(payload: SaveTelegramUserProfilePayload): Promise<TgUserRecord> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; user?: TgUserRecord | null }>(
    "tg_users_secure",
    {
      body: {
        mode: "save_profile",
        last_name: payload.lastName.trim() || null,
        first_name: payload.firstName.trim() || null,
        middle_name: payload.middleName.trim() || null,
        phone: payload.phone.trim() || null,
        email: payload.email.trim() || null,
      },
      headers: await buildTelegramUserSessionHeaders(),
    },
  );
  if (error) throw error;
  const user = resolveUserFromResponse(data);
  if (!user) throw new Error("TG_USER_PROFILE_SAVE_EMPTY_RESULT");
  return user;
}
