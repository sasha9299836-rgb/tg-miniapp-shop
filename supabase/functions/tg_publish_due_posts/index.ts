import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: HeadersInit = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info, x-cron-secret",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const cronSecret = (Deno.env.get("CRON_SECRET") ?? "").trim();
    const headerSecret = (req.headers.get("x-cron-secret") ?? "").trim();
    if (!cronSecret || headerSecret !== cronSecret) {
      return json({ error: "UNAUTHORIZED" }, 401);
    }

    const supabaseUrl = getRequiredSecret("SUPABASE_URL", "PROJECT_URL");
    const serviceRoleKey = getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data, error } = await supabase.rpc("tg_publish_due_posts", { batch_size: 100 });
    if (error) {
      console.error("tg_publish_due_posts rpc error:", error.message);
      return json({ error: "PUBLISH_FAILED", details: error.message }, 500);
    }

    const rows = (data as Array<{ id: string }> | null) ?? [];
    const ids = rows.map((row) => row.id);
    console.log("tg_publish_due_posts:", {
      dueFound: rows.length,
      publishedCount: ids.length,
      ids,
    });

    return json({ publishedCount: ids.length, ids }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("tg_publish_due_posts fatal:", message);
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
