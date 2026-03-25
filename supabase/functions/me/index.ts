import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: HeadersInit = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers":
    "content-type, authorization, apikey, x-client-info, x-admin-token",
  "access-control-max-age": "86400",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

function empty(status = 204) {
  return new Response(null, {
    status,
    headers: corsHeaders,
  });
}

function getRequiredSecret(...keys: string[]) {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  throw new Error(`Missing secret: ${keys.join(" or ")}`);
}

function isSupabaseClientToken(token: string) {
  return token.startsWith("sb_publishable_") || token.startsWith("sb_secret_");
}

function extractToken(req: Request) {
  const explicitAdminToken = req.headers.get("x-admin-token")?.trim() ?? "";
  if (explicitAdminToken) {
    return { token: explicitAdminToken, source: "x-admin-token" as const };
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token && !isSupabaseClientToken(token)) {
      return { token, source: "authorization" as const };
    }
  }

  return { token: "", source: "missing" as const };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "METHOD_NOT_ALLOWED", is_admin: false }, 405);
  }

  try {
    const { token, source } = extractToken(req);
    if (!token) {
      console.log(JSON.stringify({
        scope: "admin_auth",
        event: "admin_me_missing_token",
        hasAuthorizationHeader: Boolean((req.headers.get("authorization") ?? "").trim()),
        hasXAdminToken: Boolean((req.headers.get("x-admin-token") ?? "").trim()),
      }));
      return json({ is_admin: false, reason: "TOKEN_MISSING" }, 401);
    }

    const supabaseUrl = getRequiredSecret("SUPABASE_URL", "PROJECT_URL");
    const serviceRoleKey = getRequiredSecret("SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("tg_admin_sessions")
      .select("token, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.log(JSON.stringify({
        scope: "admin_auth",
        event: "admin_me_lookup_failed",
        source,
        details: error.message,
      }));
      return json({ is_admin: false, reason: "SESSION_LOOKUP_FAILED" }, 500);
    }

    if (!data?.token) {
      console.log(JSON.stringify({
        scope: "admin_auth",
        event: "admin_me_session_not_found",
        source,
      }));
      return json({ is_admin: false, reason: "SESSION_NOT_FOUND" }, 401);
    }

    const expiresAt = String(data.expires_at ?? "");
    if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
      console.log(JSON.stringify({
        scope: "admin_auth",
        event: "admin_me_session_expired",
        source,
        expiresAt: expiresAt || null,
      }));
      return json({ is_admin: false, reason: "SESSION_EXPIRED" }, 401);
    }

    console.log(JSON.stringify({
      scope: "admin_auth",
      event: "admin_me_success",
      source,
      expiresAt,
    }));
    return json({ is_admin: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.log(JSON.stringify({
      scope: "admin_auth",
      event: "admin_me_server_error",
      details: message,
    }));
    return json({ error: "SERVER_MISCONFIGURED", is_admin: false }, 500);
  }
});
