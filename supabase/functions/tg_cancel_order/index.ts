import {
  createSupabaseAdminClient,
  empty,
  json,
} from "../_shared/admin.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

type CancelOrderBody = {
  order_id?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;

    const body = await req.json().catch(() => null) as CancelOrderBody | null;
    const orderId = String(body?.order_id ?? "").trim();
    if (!orderId) return json({ error: "BAD_PAYLOAD" }, 400);

    const { data, error } = await supabase.rpc("tg_cancel_pending_order", {
      p_order_id: orderId,
      p_tg_user_id: userSession.tgUserId,
    });

    if (error) {
      const message = String(error.message ?? "");
      if (message.includes("ORDER_NOT_FOUND")) return json({ error: "ORDER_NOT_FOUND" }, 404);
      if (message.includes("ORDER_ACCESS_DENIED")) return json({ error: "FORBIDDEN" }, 403);
      if (message.includes("ORDER_ALREADY_IN_PROCESS")) return json({ error: "ORDER_ALREADY_IN_PROCESS" }, 409);
      if (message.includes("ORDER_STATUS_NOT_CANCELLABLE")) return json({ error: "ORDER_STATUS_NOT_CANCELLABLE" }, 409);
      return json({ error: "CANCEL_ORDER_FAILED", details: message || null }, 500);
    }

    return json({ ok: true, result: data ?? null }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
