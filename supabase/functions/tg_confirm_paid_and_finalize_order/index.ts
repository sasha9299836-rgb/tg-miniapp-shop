import {
  createSupabaseAdminClient,
  empty,
  getRequiredSecret,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";
import { classifyConfirmPaymentError, finalizePaidOrder } from "../_shared/finalizeOrder.ts";

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage.trim();
    const maybeDetails = (error as { details?: unknown }).details;
    if (typeof maybeDetails === "string" && maybeDetails.trim()) return maybeDetails.trim();
  }
  return "UNKNOWN_ERROR";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const session = await requireAdminSession(supabase, req);
    if (!session.ok) return session.response;

    const cdekProxyBaseUrl = getRequiredSecret("CDEK_PROXY_BASE_URL");
    console.log("CDEK_PROXY_BASE_URL:", cdekProxyBaseUrl);
    const body = await req.json().catch(() => null) as { order_id?: string } | null;
    const orderId = String(body?.order_id ?? "").trim();
    if (!orderId) return json({ error: "BAD_PAYLOAD" }, 400);

    console.log(JSON.stringify({ scope: "shipment", event: "confirm_paid_and_finalize_request", orderId }));
    const result = await finalizePaidOrder(supabase, cdekProxyBaseUrl, orderId);
    console.log(
      JSON.stringify({
        scope: "shipment",
        event: "confirm_paid_and_finalize_result",
        orderId,
        ok: result.ok,
        shipmentStatus: result.ok ? result.shipment.status : result.shipment.status,
        shipmentError: result.ok ? null : result.shipment.error,
      }),
    );
    return json(result);
  } catch (error) {
    const message = extractErrorMessage(error);
    console.log(
      JSON.stringify({
        scope: "shipment",
        event: "confirm_paid_and_finalize_failed",
        error: message,
        raw: error,
      }),
    );
    const classified = classifyConfirmPaymentError(message);
    if (classified) {
      return json({ error: classified.code, details: message }, classified.status);
    }
    if (message === "CONFIRM_PAYMENT_FAILED") {
      return json({ error: "CONFIRM_PAYMENT_FAILED" }, 500);
    }
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
