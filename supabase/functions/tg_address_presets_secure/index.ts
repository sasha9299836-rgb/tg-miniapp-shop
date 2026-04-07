import {
  createSupabaseAdminClient,
  empty,
  json,
} from "../_shared/admin.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

type Mode = "list" | "upsert" | "delete";

type RequestBody = {
  mode?: Mode;
  preset_id?: string | null;
  name?: string;
  recipient_fio?: string;
  recipient_phone?: string;
  city?: string;
  city_code?: string | null;
  pvz?: string;
  pvz_code?: string | null;
  is_default?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const session = await requireTelegramUserSession(supabase, req);
    if (!session.ok) return session.response;

    const body = await req.json().catch(() => null) as RequestBody | null;
    const mode = String(body?.mode ?? "").trim() as Mode;

    if (mode === "list") {
      const { data, error } = await supabase.rpc("tg_list_address_presets", {
        p_tg_user_id: session.tgUserId,
      });
      if (error) return json({ error: "ADDRESS_PRESETS_LOAD_FAILED", details: error.message }, 500);
      return json({ ok: true, mode, presets: (data ?? []) as unknown[] });
    }

    if (mode === "upsert") {
      const { data, error } = await supabase.rpc("tg_upsert_address_preset", {
        p_tg_user_id: session.tgUserId,
        p_preset_id: body?.preset_id ?? null,
        p_name: String(body?.name ?? "").trim(),
        p_recipient_fio: String(body?.recipient_fio ?? "").trim(),
        p_recipient_phone: String(body?.recipient_phone ?? "").trim(),
        p_city: String(body?.city ?? "").trim(),
        p_pvz: String(body?.pvz ?? "").trim(),
        p_is_default: Boolean(body?.is_default),
        p_city_code: body?.city_code ?? null,
        p_pvz_code: body?.pvz_code ?? null,
      });
      if (error) return json({ error: "ADDRESS_PRESET_SAVE_FAILED", details: error.message }, 500);
      return json({ ok: true, mode, preset_id: data ?? null });
    }

    if (mode === "delete") {
      const presetId = String(body?.preset_id ?? "").trim();
      if (!presetId) return json({ error: "BAD_PAYLOAD" }, 400);

      const { error } = await supabase.rpc("tg_delete_address_preset", {
        p_tg_user_id: session.tgUserId,
        p_preset_id: presetId,
      });
      if (error) {
        const message = String(error.message ?? "");
        if (message.includes("NOT_FOUND")) return json({ error: "NOT_FOUND" }, 404);
        if (message.includes("FORBIDDEN")) return json({ error: "FORBIDDEN" }, 403);
        return json({ error: "ADDRESS_PRESET_DELETE_FAILED", details: message }, 500);
      }

      return json({ ok: true, mode });
    }

    return json({ error: "BAD_PAYLOAD" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
