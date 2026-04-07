import {
  createSupabaseAdminClient,
  empty,
  json,
} from "../_shared/admin.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

type SubmitPaymentProofBody = {
  order_id?: string;
  payment_proof_key?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;

    const body = await req.json().catch(() => null) as SubmitPaymentProofBody | null;
    const orderId = String(body?.order_id ?? "").trim();
    const paymentProofKey = String(body?.payment_proof_key ?? "").trim();
    if (!orderId || !paymentProofKey) {
      return json({ error: "BAD_PAYLOAD" }, 400);
    }

    const { data: order, error: orderError } = await supabase
      .from("tg_orders")
      .select("id, tg_user_id")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) {
      return json({ error: "ORDER_LOOKUP_FAILED", details: orderError.message }, 500);
    }
    if (!order || Number((order as { tg_user_id: number }).tg_user_id) !== userSession.tgUserId) {
      return json({ error: "FORBIDDEN" }, 403);
    }

    const { error: submitError } = await supabase.rpc("tg_submit_payment_proof", {
      p_order_id: orderId,
      p_tg_user_id: userSession.tgUserId,
      p_payment_proof_key: paymentProofKey,
    });

    if (submitError) {
      const message = submitError.message ?? "";
      if (message.includes("ORDER_RESERVATION_EXPIRED")) {
        return json({ error: "ORDER_RESERVATION_EXPIRED" }, 409);
      }
      if (message.includes("ORDER_STATUS_NOT_SUBMITTABLE")) {
        return json({ error: "ORDER_STATUS_NOT_SUBMITTABLE" }, 409);
      }
      if (message.includes("ORDER_NOT_FOUND_OR_FORBIDDEN")) {
        return json({ error: "FORBIDDEN" }, 403);
      }
      return json({ error: "SUBMIT_PAYMENT_PROOF_FAILED", details: message || null }, 500);
    }

    return json({ ok: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
