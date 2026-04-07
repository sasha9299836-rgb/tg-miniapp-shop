import {
  createSupabaseAdminClient,
  empty,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";

type AdminOrderEventRow = {
  id: number;
  order_id: string;
  event: string;
  payload: Record<string, unknown>;
  created_at: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const session = await requireAdminSession(supabase, req);
    if (!session.ok) return session.response;

    const body = await req.json().catch(() => null) as { order_id?: string } | null;
    const orderId = String(body?.order_id ?? "").trim();
    if (!orderId) return json({ error: "BAD_PAYLOAD" }, 400);

    const { data, error } = await supabase
      .from("tg_order_events")
      .select("id, order_id, event, payload, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) {
      return json({ error: "ORDER_EVENTS_LOAD_FAILED", details: error.message }, 500);
    }

    return json({
      ok: true,
      order_id: orderId,
      events: (data ?? []) as AdminOrderEventRow[],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
