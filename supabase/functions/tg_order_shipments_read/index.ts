import {
  createSupabaseAdminClient,
  empty,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

type ReadMode = "user_by_order_id" | "user_by_order_ids" | "admin_by_order_ids";

type RequestBody = {
  mode?: ReadMode;
  order_id?: string;
  order_ids?: string[];
};

function normalizeOrderIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const body = await req.json().catch(() => null) as RequestBody | null;
    const mode = String(body?.mode ?? "").trim() as ReadMode;

    if (mode === "admin_by_order_ids") {
      const session = await requireAdminSession(supabase, req);
      if (!session.ok) return session.response;

      const orderIds = normalizeOrderIds(body?.order_ids);
      if (!orderIds.length) return json({ error: "BAD_PAYLOAD" }, 400);

      const { data, error } = await supabase
        .from("tg_order_shipments")
        .select("*")
        .in("order_id", orderIds)
        .order("created_at", { ascending: true });
      if (error) return json({ error: "SHIPMENTS_LOAD_FAILED", details: error.message }, 500);
      return json({ ok: true, mode, shipments: data ?? [] });
    }

    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;
    const tgUserId = userSession.tgUserId;

    if (mode === "user_by_order_id") {
      const orderId = String(body?.order_id ?? "").trim();
      if (!orderId) return json({ error: "BAD_PAYLOAD" }, 400);

      const { data: order, error: orderError } = await supabase
        .from("tg_orders")
        .select("id")
        .eq("id", orderId)
        .eq("tg_user_id", tgUserId)
        .maybeSingle();
      if (orderError) return json({ error: "ORDER_ACCESS_CHECK_FAILED", details: orderError.message }, 500);
      if (!order) return json({ ok: true, mode, shipments: [] });

      const { data, error } = await supabase
        .from("tg_order_shipments")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) return json({ error: "SHIPMENTS_LOAD_FAILED", details: error.message }, 500);
      return json({ ok: true, mode, shipments: data ?? [] });
    }

    if (mode === "user_by_order_ids") {
      const requestedOrderIds = normalizeOrderIds(body?.order_ids);
      if (!requestedOrderIds.length) return json({ error: "BAD_PAYLOAD" }, 400);

      const { data: orders, error: orderError } = await supabase
        .from("tg_orders")
        .select("id")
        .eq("tg_user_id", tgUserId)
        .in("id", requestedOrderIds);
      if (orderError) return json({ error: "ORDER_ACCESS_CHECK_FAILED", details: orderError.message }, 500);

      const allowedOrderIds = (orders ?? [])
        .map((row) => String((row as { id: string }).id ?? "").trim())
        .filter(Boolean);
      if (!allowedOrderIds.length) return json({ ok: true, mode, shipments: [] });

      const { data, error } = await supabase
        .from("tg_order_shipments")
        .select("*")
        .in("order_id", allowedOrderIds)
        .order("created_at", { ascending: true });
      if (error) return json({ error: "SHIPMENTS_LOAD_FAILED", details: error.message }, 500);
      return json({ ok: true, mode, shipments: data ?? [] });
    }

    return json({ error: "BAD_PAYLOAD" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
