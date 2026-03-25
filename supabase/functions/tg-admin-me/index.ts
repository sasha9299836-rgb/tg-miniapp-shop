import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, apikey, x-admin-token",
  "access-control-allow-methods": "POST,OPTIONS",
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

function getRequiredSecret(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

function isSupabaseClientToken(token: string) {
  return token.startsWith("sb_publishable_") || token.startsWith("sb_secret_");
}

function extractToken(req: Request) {
  const explicitAdminToken = req.headers.get("x-admin-token")?.trim();
  if (explicitAdminToken) {
    return explicitAdminToken;
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token && !isSupabaseClientToken(token)) return token;
  }

  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ ok: false, isAdmin: false }, 405);

  try {
    const token = extractToken(req);
    if (!token) return json({ ok: false, isAdmin: false }, 401);

    const supabaseUrl = getRequiredSecret("SUPABASE_URL");
    const serviceRoleKey = getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("tg_admin_sessions")
      .select("expires_at")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !data?.expires_at) {
      return json({ ok: false, isAdmin: false }, 401);
    }

    return json({ ok: true, isAdmin: true, expires_at: data.expires_at }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return json({ ok: false, isAdmin: false, error: message }, 500);
  }
});
