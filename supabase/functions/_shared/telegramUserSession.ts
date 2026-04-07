import { createSupabaseAdminClient, json } from "./admin.ts";

type TelegramUserSessionRow = {
  token: string;
  tg_user_id: number;
  expires_at: string;
};

function isSupabaseClientToken(token: string) {
  return token.startsWith("sb_publishable_") || token.startsWith("sb_secret_");
}

function generateSessionToken() {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const randomSuffix = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${crypto.randomUUID()}-${randomSuffix}`;
}

function resolveUserSessionTtlSeconds(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? "");
  if (!Number.isInteger(parsed) || parsed <= 0) return 900;
  return Math.min(86400, Math.max(60, parsed));
}

export function getUserSessionToken(req: Request): string {
  const explicit = (req.headers.get("x-tg-user-session") ?? "").trim();
  if (explicit) return explicit;

  const authorizationHeader = (req.headers.get("authorization") ?? "").trim();
  if (!authorizationHeader.toLowerCase().startsWith("bearer ")) return "";
  const token = authorizationHeader.slice(7).trim();
  if (!token || isSupabaseClientToken(token)) return "";
  return token;
}

export async function createTelegramUserSession(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  tgUserId: number,
) {
  const ttlSeconds = resolveUserSessionTtlSeconds(Deno.env.get("TG_USER_SESSION_TTL_SECONDS"));
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const { error: cleanupError } = await supabase
    .from("tg_user_sessions")
    .delete()
    .lt("expires_at", new Date().toISOString());
  if (cleanupError) {
    return { ok: false as const, error: cleanupError.message };
  }

  const { error } = await supabase.from("tg_user_sessions").insert({
    token,
    tg_user_id: tgUserId,
    expires_at: expiresAt,
  });
  if (error) {
    return { ok: false as const, error: error.message };
  }

  return {
    ok: true as const,
    token,
    expiresAt,
    ttlSeconds,
  };
}

export async function requireTelegramUserSession(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  req: Request,
) {
  const sessionToken = getUserSessionToken(req);
  console.log(JSON.stringify({
    scope: "telegram_user_session",
    event: "session_header_checked",
    hasSessionToken: Boolean(sessionToken),
  }));
  if (!sessionToken) {
    return { ok: false as const, response: json({ error: "UNAUTHORIZED" }, 401) };
  }

  const { data, error } = await supabase
    .from("tg_user_sessions")
    .select("token, tg_user_id, expires_at")
    .eq("token", sessionToken)
    .maybeSingle();

  if (error) {
    console.log(JSON.stringify({
      scope: "telegram_user_session",
      event: "session_lookup_failed",
    }));
    return { ok: false as const, response: json({ error: "SESSION_CHECK_FAILED" }, 500) };
  }

  const session = (data ?? null) as TelegramUserSessionRow | null;
  if (!session) {
    console.log(JSON.stringify({
      scope: "telegram_user_session",
      event: "session_not_found",
    }));
    return { ok: false as const, response: json({ error: "UNAUTHORIZED" }, 401) };
  }

  const expiresAtMs = new Date(session.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    console.log(JSON.stringify({
      scope: "telegram_user_session",
      event: "session_expired",
    }));
    return { ok: false as const, response: json({ error: "UNAUTHORIZED" }, 401) };
  }
  console.log(JSON.stringify({
    scope: "telegram_user_session",
    event: "session_valid",
    tgUserId: Number(session.tg_user_id),
  }));

  return {
    ok: true as const,
    tgUserId: Number(session.tg_user_id),
    token: session.token,
    expiresAt: session.expires_at,
  };
}
