import { supabase } from "./supabaseClient";

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
  tg_user_id: number;
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

export async function listAddressPresets(tgUserId: number): Promise<TgAddressPreset[]> {
  const { data, error } = await supabase.rpc("tg_list_address_presets", {
    p_tg_user_id: tgUserId,
  });
  if (error) throw error;
  return (data as TgAddressPreset[] | null) ?? [];
}

export async function upsertAddressPreset(payload: UpsertAddressPresetPayload): Promise<string> {
  const { data, error } = await supabase.rpc("tg_upsert_address_preset", {
    p_tg_user_id: payload.tg_user_id,
    p_preset_id: payload.preset_id ?? null,
    p_name: payload.name,
    p_recipient_fio: payload.recipient_fio,
    p_recipient_phone: payload.recipient_phone,
    p_city: payload.city,
    p_pvz: payload.pvz,
    p_is_default: payload.is_default ?? false,
    p_city_code: payload.city_code ?? null,
    p_pvz_code: payload.pvz_code ?? null,
  });
  if (error) throw error;

  const raw =
    typeof data === "string"
      ? data
      : Array.isArray(data)
      ? (data[0] as { tg_upsert_address_preset?: string } | undefined)?.tg_upsert_address_preset
      : (data as { tg_upsert_address_preset?: string } | null)?.tg_upsert_address_preset;

  const id = String(raw ?? "").trim();
  if (!id) throw new Error("PRESET_SAVE_FAILED");
  return id;
}

export async function deleteAddressPreset(tgUserId: number, presetId: string): Promise<void> {
  const { error } = await supabase.rpc("tg_delete_address_preset", {
    p_tg_user_id: tgUserId,
    p_preset_id: presetId,
  });
  if (error) throw error;
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
