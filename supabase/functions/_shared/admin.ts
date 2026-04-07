import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token, x-tg-user-session, x-cdek-webhook-secret, x-webhook-secret, x-cron-secret, x-internal-secret",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin, Access-Control-Request-Headers, Access-Control-Request-Method",
};

export function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

export function empty(status = 204) {
  return new Response(null, {
    status,
    headers: {
      ...corsHeaders,
    },
  });
}

export function getRequiredSecret(...keys: string[]) {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  throw new Error(`Missing secret: ${keys.join(" | ")}`);
}

export function getOptionalSecret(...keys: string[]) {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  return "";
}

export function getDebugId(req: Request): string {
  const raw = (req.headers.get("x-debug-id") ?? "").trim();
  if (!raw) return "";
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(raw)) return "";
  return raw;
}

function isSupabaseClientToken(token: string) {
  return token.startsWith("sb_publishable_") || token.startsWith("sb_secret_");
}

export function getAdminToken(req: Request) {
  const explicitAdminToken = (req.headers.get("x-admin-token") ?? "").trim();
  if (explicitAdminToken) return explicitAdminToken;

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return "";

  const bearerToken = auth.slice(7).trim();
  if (!bearerToken || isSupabaseClientToken(bearerToken)) return "";
  return bearerToken;
}

export function createSupabaseAdminClient() {
  const supabaseUrl = getRequiredSecret("SUPABASE_URL", "PROJECT_URL");
  const serviceRoleKey = getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export async function requireAdminSession(supabase: ReturnType<typeof createSupabaseAdminClient>, req: Request) {
  const adminToken = getAdminToken(req);
  if (!adminToken) {
    console.log(JSON.stringify({
      scope: "admin_auth",
      event: "admin_session_missing_token",
      hasXAdminToken: Boolean((req.headers.get("x-admin-token") ?? "").trim()),
      hasAuthorizationHeader: Boolean((req.headers.get("authorization") ?? "").trim()),
    }));
    return { ok: false as const, response: json({ error: "UNAUTHORIZED" }, 401) };
  }

  const { data: session, error: sessionErr } = await supabase
    .from("tg_admin_sessions")
    .select("token, expires_at")
    .eq("token", adminToken)
    .maybeSingle();

  if (sessionErr) {
    console.log(JSON.stringify({
      scope: "admin_auth",
      event: "admin_session_lookup_failed",
      details: sessionErr.message,
    }));
    return {
      ok: false as const,
      response: json({ error: "SESSION_CHECK_FAILED", details: sessionErr.message }, 500),
    };
  }

  if (!session) {
    console.log(JSON.stringify({
      scope: "admin_auth",
      event: "admin_session_not_found",
    }));
    return { ok: false as const, response: json({ error: "UNAUTHORIZED" }, 401) };
  }

  const expiresAt = String((session as { expires_at?: string | null }).expires_at ?? "");
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    console.log(JSON.stringify({
      scope: "admin_auth",
      event: "admin_session_expired",
      expiresAt: expiresAt || null,
    }));
    return { ok: false as const, response: json({ error: "UNAUTHORIZED" }, 401) };
  }

  console.log(JSON.stringify({
    scope: "admin_auth",
    event: "admin_session_validated",
    expiresAt,
  }));
  return { ok: true as const, adminToken };
}
