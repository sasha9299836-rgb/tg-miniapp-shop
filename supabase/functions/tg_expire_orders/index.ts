import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { expirePendingOrders } from "../_shared/orderExpiration.ts";

const corsHeaders: HeadersInit = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
  "access-control-max-age": "86400",
};

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

function empty(status = 204) {
  return new Response(null, { status, headers: corsHeaders });
}

function getSecret(...keys: string[]) {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  throw new Error(`Missing secret: ${keys.join(" | ")}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabaseUrl = getSecret("SUPABASE_URL", "PROJECT_URL");
    const serviceRoleKey = getSecret("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const result = await expirePendingOrders(supabase);
    return json(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("SELECT_FAILED:")) {
      return json({ error: "SELECT_FAILED", details: message.slice("SELECT_FAILED:".length) }, 500);
    }
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
