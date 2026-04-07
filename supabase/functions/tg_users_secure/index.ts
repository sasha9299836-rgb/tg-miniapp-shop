import {
  createSupabaseAdminClient,
  empty,
  json,
} from "../_shared/admin.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

type Mode = "bootstrap" | "load_profile" | "save_profile";

type RequestBody = {
  mode?: Mode;
  telegram_username?: string | null;
  telegram_first_name?: string | null;
  telegram_last_name?: string | null;
  last_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

const USER_SELECT_COLUMNS = [
  "id",
  "telegram_id",
  "is_admin",
  "telegram_username",
  "telegram_first_name",
  "telegram_last_name",
  "last_name",
  "first_name",
  "middle_name",
  "email",
  "phone",
  "registered_at",
  "updated_at",
].join(", ");

function trimOrNull(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;

    const body = await req.json().catch(() => null) as RequestBody | null;
    const mode = String(body?.mode ?? "").trim() as Mode;

    if (mode === "bootstrap") {
      const { data, error } = await supabase
        .from("tg_users")
        .upsert({
          telegram_id: userSession.tgUserId,
          telegram_username: trimOrNull(body?.telegram_username),
          telegram_first_name: trimOrNull(body?.telegram_first_name),
          telegram_last_name: trimOrNull(body?.telegram_last_name),
          updated_at: new Date().toISOString(),
        }, { onConflict: "telegram_id" })
        .select(USER_SELECT_COLUMNS)
        .single();

      if (error) {
        return json({ error: "USER_BOOTSTRAP_FAILED", details: error.message }, 500);
      }

      return json({ ok: true, mode, user: data ?? null });
    }

    if (mode === "load_profile") {
      const { data, error } = await supabase
        .from("tg_users")
        .select(USER_SELECT_COLUMNS)
        .eq("telegram_id", userSession.tgUserId)
        .maybeSingle();

      if (error) {
        return json({ error: "USER_PROFILE_LOAD_FAILED", details: error.message }, 500);
      }

      return json({ ok: true, mode, user: data ?? null });
    }

    if (mode === "save_profile") {
      const { data, error } = await supabase
        .from("tg_users")
        .upsert({
          telegram_id: userSession.tgUserId,
          last_name: trimOrNull(body?.last_name),
          first_name: trimOrNull(body?.first_name),
          middle_name: trimOrNull(body?.middle_name),
          phone: trimOrNull(body?.phone),
          email: trimOrNull(body?.email),
          updated_at: new Date().toISOString(),
        }, { onConflict: "telegram_id" })
        .select(USER_SELECT_COLUMNS)
        .single();

      if (error) {
        return json({ error: "USER_PROFILE_SAVE_FAILED", details: error.message }, 500);
      }

      return json({ ok: true, mode, user: data ?? null });
    }

    return json({ error: "BAD_PAYLOAD" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
