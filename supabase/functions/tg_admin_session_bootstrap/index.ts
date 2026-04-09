import {
  createSupabaseAdminClient,
  empty,
  json,
} from "../_shared/admin.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

function buildSessionToken() {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const suffix = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${crypto.randomUUID()}-${suffix}`;
}

function buildSessionExpiresAt() {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 7);
  return value.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;

    const { data: userRow, error: userError } = await supabase
      .from("tg_users")
      .select("is_admin")
      .eq("telegram_id", userSession.tgUserId)
      .maybeSingle();

    if (userError) {
      return json({ error: "ADMIN_USER_LOOKUP_FAILED", details: userError.message }, 500);
    }

    if (!userRow || !Boolean((userRow as { is_admin?: boolean | null }).is_admin)) {
      return json({ error: "FORBIDDEN" }, 403);
    }

    const sessionToken = buildSessionToken();
    const expiresAt = buildSessionExpiresAt();
    const { error: insertError } = await supabase
      .from("tg_admin_sessions")
      .insert({ token: sessionToken, expires_at: expiresAt });

    if (insertError) {
      return json({ error: "ADMIN_SESSION_CREATE_FAILED", details: insertError.message }, 500);
    }

    return json({
      ok: true,
      session_token: sessionToken,
      expires_at: expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});

