import { supabase } from "./supabaseClient";
import { TG_IDENTITY_REQUIRED_ERROR } from "../auth/tgUser";
import { ensureTelegramUserSessionToken } from "../auth/tgUserSession";

export const TG_SELECTED_ADDRESS_PRESET_ID_KEY = "tg_selected_address_preset_id";

export type TgAddressPreset = {
  id: string;
  tg_user_id: number;
  name: string;
  recipient_fio: string;
  recipient_phone: string;
  recipient_email?: string | null;
  city: string;
  city_code?: string | null;
  pvz: string;
  pvz_code?: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type UpsertAddressPresetPayload = {
  preset_id?: string | null;
  name: string;
  recipient_fio: string;
  recipient_phone: string;
  city: string;
  city_code?: string | null;
  pvz: string;
  pvz_code?: string | null;
  is_default?: boolean;
};

async function buildTelegramUserSessionHeaders(): Promise<Record<string, string>> {
  const token = await ensureTelegramUserSessionToken();
  if (!token) throw new Error(TG_IDENTITY_REQUIRED_ERROR);
  return { "x-tg-user-session": token };
}

export async function listAddressPresets(): Promise<TgAddressPreset[]> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; presets?: TgAddressPreset[] }>(
    "tg_address_presets_secure",
    {
      body: { mode: "list" },
      headers: await buildTelegramUserSessionHeaders(),
    },
  );
  if (error) throw error;
  if (!data?.ok) throw new Error("ADDRESS_PRESETS_LOAD_FAILED");
  return data.presets ?? [];
}

export async function upsertAddressPreset(payload: UpsertAddressPresetPayload): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    preset_id?: string | { tg_upsert_address_preset?: string } | Array<{ tg_upsert_address_preset?: string }>;
  }>("tg_address_presets_secure", {
    body: {
      mode: "upsert",
      preset_id: payload.preset_id ?? null,
      name: payload.name,
      recipient_fio: payload.recipient_fio,
      recipient_phone: payload.recipient_phone,
      city: payload.city,
      pvz: payload.pvz,
      is_default: payload.is_default ?? false,
      city_code: payload.city_code ?? null,
      pvz_code: payload.pvz_code ?? null,
    },
    headers: await buildTelegramUserSessionHeaders(),
  });
  if (error) throw error;
  if (!data?.ok) throw new Error("PRESET_SAVE_FAILED");

  const raw =
    typeof data.preset_id === "string"
      ? data.preset_id
      : Array.isArray(data.preset_id)
      ? (data.preset_id[0] as { tg_upsert_address_preset?: string } | undefined)?.tg_upsert_address_preset
      : (data.preset_id as { tg_upsert_address_preset?: string } | null)?.tg_upsert_address_preset;

  const id = String(raw ?? "").trim();
  if (!id) throw new Error("PRESET_SAVE_FAILED");
  return id;
}

export async function deleteAddressPreset(presetId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    "tg_address_presets_secure",
    {
      body: { mode: "delete", preset_id: presetId },
      headers: await buildTelegramUserSessionHeaders(),
    },
  );
  if (error) throw error;
  if (!data?.ok) {
    const code = String(data?.error ?? "");
    if (code === "FORBIDDEN") throw new Error("FORBIDDEN");
    if (code === "NOT_FOUND") throw new Error("NOT_FOUND");
    throw new Error("ADDRESS_PRESET_DELETE_FAILED");
  }
}

export function readSelectedPresetId(): string | null {
  try {
    const raw = window.localStorage.getItem(TG_SELECTED_ADDRESS_PRESET_ID_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function saveSelectedPresetId(presetId: string | null) {
  try {
    if (!presetId) {
      window.localStorage.removeItem(TG_SELECTED_ADDRESS_PRESET_ID_KEY);
      return;
    }
    window.localStorage.setItem(TG_SELECTED_ADDRESS_PRESET_ID_KEY, presetId);
  } catch {
    // ignore storage errors
  }
}
