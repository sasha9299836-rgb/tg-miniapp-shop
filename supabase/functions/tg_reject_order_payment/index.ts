import {
  createSupabaseAdminClient,
  empty,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";
import { rejectOrderPaymentForOrder } from "../_shared/paymentReview.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const session = await requireAdminSession(supabase, req);
    if (!session.ok) return session.response;

    const body = await req.json().catch(() => null) as { order_id?: string; reason?: string } | null;
    const orderId = String(body?.order_id ?? "").trim();
    const reason = String(body?.reason ?? "").trim();
    if (!orderId || !reason) return json({ error: "BAD_PAYLOAD" }, 400);

    const result = await rejectOrderPaymentForOrder(supabase, orderId, reason);
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === "ORDER_NOT_FOUND") return json({ error: "ORDER_NOT_FOUND" }, 404);
    if (message.startsWith("ORDER_STATUS_NOT_REJECTABLE:")) {
      return json({ error: "ORDER_STATUS_NOT_REJECTABLE", details: message.slice("ORDER_STATUS_NOT_REJECTABLE:".length) }, 409);
    }
    if (message.startsWith("ORDER_LOOKUP_FAILED:")) {
      return json({ error: "ORDER_LOOKUP_FAILED", details: message.slice("ORDER_LOOKUP_FAILED:".length) }, 500);
    }
    if (message.startsWith("ORDER_REJECT_UPDATE_FAILED:")) {
      return json({ error: "ORDER_REJECT_UPDATE_FAILED", details: message.slice("ORDER_REJECT_UPDATE_FAILED:".length) }, 500);
    }
    if (message.startsWith("POST_RELEASE_FAILED:")) {
      return json({ error: "POST_RELEASE_FAILED", details: message.slice("POST_RELEASE_FAILED:".length) }, 500);
    }
    if (message.startsWith("ORDER_EVENT_SAVE_FAILED:")) {
      return json({ error: "ORDER_EVENT_SAVE_FAILED", details: message.slice("ORDER_EVENT_SAVE_FAILED:".length) }, 500);
    }
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
