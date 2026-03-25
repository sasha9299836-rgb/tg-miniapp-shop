import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, apikey",
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

function addDaysToNow(days: number) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString();
}

function generateToken() {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = getRequiredSecret("SUPABASE_URL");
    const serviceRoleKey = getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY");
    const adminCode = getRequiredSecret("TG_ADMIN_CODE");

    const body = await req.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code || code !== adminCode.trim()) {
      return json({ ok: false }, 401);
    }

    const token = generateToken();
    const expiresAt = addDaysToNow(7);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { error } = await supabase.from("tg_admin_sessions").insert({
      token,
      expires_at: expiresAt,
    });

    if (error) {
      return json({ ok: false, error: "Session insert failed" }, 500);
    }

    return json({ ok: true, token, expires_at: expiresAt }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return json({ ok: false, error: message }, 500);
  }
});
