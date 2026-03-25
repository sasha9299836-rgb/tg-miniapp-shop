import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUILD_ID = "admin_login_build_2026-02-18_07";

const corsHeaders: HeadersInit = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers":
    "content-type, authorization, apikey, x-client-info, x-admin-token",
  "access-control-max-age": "86400",
};

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ build_id: BUILD_ID, ...payload }), {
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

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function generateSessionToken() {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const randomSuffix = Array.from(randomBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${crypto.randomUUID()}-${randomSuffix}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "BAD_JSON" }, 400);
    }

    const parsedBody = body && typeof body === "object"
      ? (body as { code?: unknown; debug?: unknown })
      : {};
    const code = typeof parsedBody.code === "string" ? parsedBody.code.trim() : "";
    const codeLen = code.length;
    const rawA = Deno.env.get("TG_ADMIN_CODE") ?? "";
    const rawB = Deno.env.get("ADMIN_CODE") ?? "";
    const adminCode = (rawA || rawB).trim();
    const adminCodeLen = adminCode.length;
    const hasTG = rawA.trim().length > 0;
    const hasADMIN = rawB.trim().length > 0;
    const isDebug = parsedBody.debug === true;

    if (isDebug) {
      return json({
        debug: true,
        hasTG,
        hasADMIN,
        adminCodeLen,
        inputCodeLen: codeLen,
        inputStartsWith: codeLen > 0 ? code.slice(0, 2) : "",
        adminStartsWith: adminCodeLen > 0 ? adminCode.slice(0, 2) : "",
      }, 200);
    }

    if (!adminCode) {
      console.log(JSON.stringify({
        scope: "admin_auth",
        event: "admin_login_misconfigured",
        hasTG,
        hasADMIN,
      }));
      return json({ error: "SERVER_MISCONFIGURED" }, 500);
    }

    const supabaseUrl = getRequiredSecret("SUPABASE_URL", "PROJECT_URL");
    const serviceRoleKey = getRequiredSecret("SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");

    const ok = code.length > 0 && code === adminCode;

    if (!ok) {
      console.log(JSON.stringify({
        scope: "admin_auth",
        event: "admin_login_invalid_code",
        codeLength: codeLen,
      }));
      return json({ error: "INVALID_CODE" }, 401);
    }

    const sessionToken = generateSessionToken();
    const expiresAt = addDays(new Date(), 7).toISOString();

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { error } = await supabase.from("tg_admin_sessions").insert({
      token: sessionToken,
      expires_at: expiresAt,
    });

    if (error) {
      console.log(JSON.stringify({
        scope: "admin_auth",
        event: "admin_session_create_failed",
        details: error.message,
      }));
      return json({ error: "SESSION_CREATE_FAILED" }, 500);
    }

    console.log(JSON.stringify({
      scope: "admin_auth",
      event: "admin_session_created",
      expiresAt,
    }));
    return json({ session_token: sessionToken, expires_at: expiresAt }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.log(JSON.stringify({
      scope: "admin_auth",
      event: "admin_login_server_error",
      details: message,
    }));
    return json({ error: "SERVER_MISCONFIGURED" }, 500);
  }
});
