import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseUrl = getRequiredSecret("SUPABASE_URL", "PROJECT_URL");
    const serviceRoleKey = getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const nowIso = new Date().toISOString();
    const { data: duePosts, error: dueError } = await supabase
      .from("tg_posts")
      .select("id")
      .eq("status", "scheduled")
      .is("published_at", null)
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(200);

    if (dueError) {
      console.error("publish_due_posts: select error", dueError.message);
      return json({ error: "SELECT_DUE_FAILED", details: dueError.message }, 500);
    }

    const ids = (duePosts ?? []).map((row) => String((row as { id: string }).id));
    if (ids.length === 0) {
      console.log("publish_due_posts: nothing to publish");
      return json({ dueCount: 0, publishedCount: 0, ids: [] }, 200);
    }

    const { data: updated, error: updateError } = await supabase
      .from("tg_posts")
      .update({
        status: "published",
        published_at: nowIso,
        scheduled_at: null,
      })
      .in("id", ids)
      .eq("status", "scheduled")
      .is("published_at", null)
      .select("id");

    if (updateError) {
      console.error("publish_due_posts: update error", updateError.message);
      return json({ error: "PUBLISH_UPDATE_FAILED", details: updateError.message }, 500);
    }

    const publishedIds = (updated ?? []).map((row) => String((row as { id: string }).id));
    console.log("publish_due_posts:", {
      dueCount: ids.length,
      publishedCount: publishedIds.length,
      ids: publishedIds,
    });

    return json({ dueCount: ids.length, publishedCount: publishedIds.length, ids: publishedIds }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error("publish_due_posts fatal:", message);
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
