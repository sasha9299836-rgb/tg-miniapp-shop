import {
  createSupabaseAdminClient,
  empty,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

type ReadMode = "user_by_order_id" | "admin_by_order_id";

type ReadBody = {
  mode?: ReadMode;
  order_id?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const body = await req.json().catch(() => null) as ReadBody | null;
    const mode = String(body?.mode ?? "user_by_order_id").trim() as ReadMode;
    const orderId = String(body?.order_id ?? "").trim();
    if (!orderId) return json({ error: "BAD_PAYLOAD" }, 400);

    if (mode === "admin_by_order_id") {
      const adminSession = await requireAdminSession(supabase, req);
      if (!adminSession.ok) return adminSession.response;
      const { data: order, error: orderError } = await supabase
        .from("tg_orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      if (orderError) return json({ error: "ORDER_LOAD_FAILED", details: orderError.message }, 500);
      if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404);

      const { data: timelineRows, error: timelineError } = await supabase
        .from("tg_order_status_events")
        .select("status, changed_at, source, meta")
        .eq("order_id", orderId)
        .order("changed_at", { ascending: true });
      if (timelineError) return json({ error: "ORDER_TIMELINE_LOAD_FAILED", details: timelineError.message }, 500);

      return json({
        ok: true,
        mode,
        order,
        timeline: timelineRows ?? [],
      });
    }

    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;

    const { data, error } = await supabase.rpc("tg_get_order_with_timeline", {
      p_order_id: orderId,
      p_tg_user_id: userSession.tgUserId,
    });
    if (error) {
      const message = error.message ?? "";
      if (message.includes("ORDER_NOT_FOUND_OR_FORBIDDEN")) return json({ error: "FORBIDDEN" }, 403);
      return json({ error: "ORDER_TIMELINE_LOAD_FAILED", details: message }, 500);
    }

    const payload = (data ?? null) as { order?: unknown; timeline?: unknown } | null;
    return json({
      ok: true,
      mode,
      order: payload?.order ?? null,
      timeline: Array.isArray(payload?.timeline) ? payload?.timeline : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
