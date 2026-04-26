import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: HeadersInit = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info, x-cron-secret, x-internal-secret",
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

function getCronSecret(req: Request) {
  return (req.headers.get("x-cron-secret") ?? req.headers.get("x-internal-secret") ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const configuredCronSecret = getRequiredSecret("PUBLISH_DUE_POSTS_CRON_SECRET", "CRON_SECRET");
    const providedCronSecret = getCronSecret(req);
    if (!providedCronSecret || providedCronSecret !== configuredCronSecret) {
      return json({ error: "UNAUTHORIZED" }, 401);
    }

    const supabaseUrl = getRequiredSecret("SUPABASE_URL", "PROJECT_URL");
    const serviceRoleKey = getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Legacy alias: keep endpoint alive, but delegate to canonical SQL path.
    const { data, error } = await supabase.rpc("tg_publish_due_posts", { batch_size: 100 });
    if (error) {
      console.error("publish_due_posts (alias) rpc error:", error.message);
      return json({ error: "PUBLISH_FAILED", details: error.message }, 500);
    }

    const rows = (data as Array<{ id: string }> | null) ?? [];
    const ids = rows.map((row) => row.id);
    console.log("publish_due_posts (alias):", {
      dueFound: rows.length,
      publishedCount: ids.length,
      ids,
    });

    return json({ publishedCount: ids.length, ids }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("publish_due_posts (alias) fatal:", message);
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
