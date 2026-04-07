import {
  createSupabaseAdminClient,
  empty,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

type TgOrderReadMode = "user_list" | "user_one" | "admin_by_statuses";

type TgOrderReadBody = {
  mode?: TgOrderReadMode;
  order_id?: string;
  statuses?: string[];
};

function normalizeStatuses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const body = await req.json().catch(() => null) as TgOrderReadBody | null;
    const mode = String(body?.mode ?? "").trim() as TgOrderReadMode;

    if (mode === "admin_by_statuses") {
      const session = await requireAdminSession(supabase, req);
      if (!session.ok) return session.response;

      const statuses = normalizeStatuses(body?.statuses);
      if (!statuses.length) return json({ error: "BAD_PAYLOAD" }, 400);

      const { data, error } = await supabase
        .from("tg_orders")
        .select("*")
        .in("status", statuses)
        .order("created_at", { ascending: false });
      if (error) return json({ error: "ORDERS_LOAD_FAILED", details: error.message }, 500);
      return json({ ok: true, mode, orders: data ?? [] });
    }

    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;
    const tgUserId = userSession.tgUserId;

    if (mode === "user_one") {
      const orderId = String(body?.order_id ?? "").trim();
      if (!orderId) return json({ error: "BAD_PAYLOAD" }, 400);

      const { data, error } = await supabase
        .from("tg_orders")
        .select("*")
        .eq("id", orderId)
        .eq("tg_user_id", tgUserId)
        .maybeSingle();
      if (error) return json({ error: "ORDER_LOAD_FAILED", details: error.message }, 500);
      return json({ ok: true, mode, order: data ?? null });
    }

    if (mode === "user_list") {
      const { data, error } = await supabase
        .from("tg_orders")
        .select("*")
        .eq("tg_user_id", tgUserId)
        .order("created_at", { ascending: false });
      if (error) return json({ error: "ORDERS_LOAD_FAILED", details: error.message }, 500);
      return json({ ok: true, mode, orders: data ?? [] });
    }

    return json({ error: "BAD_PAYLOAD" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
