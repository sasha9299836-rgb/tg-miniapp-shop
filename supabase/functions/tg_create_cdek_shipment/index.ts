import {
  createSupabaseAdminClient,
  empty,
  getRequiredSecret,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";
import { createShipmentForOrder, ShipmentProcessError } from "../_shared/cdekShipment.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const session = await requireAdminSession(supabase, req);
    if (!session.ok) return session.response;

    const cdekProxyBaseUrl = getRequiredSecret("CDEK_PROXY_BASE_URL");
    const body = await req.json().catch(() => null) as { order_id?: string } | null;
    const orderId = String(body?.order_id ?? "").trim();
    if (!orderId) return json({ error: "BAD_PAYLOAD" }, 400);

    const result = await createShipmentForOrder(supabase, cdekProxyBaseUrl, orderId);

    if (result.status === "skipped" && result.reason === "order_not_paid") {
      return json({ error: "ORDER_NOT_PAID" }, 409);
    }

    if (result.status === "skipped" && result.reason === "delivery_type_not_supported") {
      return json({ error: "DELIVERY_TYPE_NOT_SUPPORTED" }, 409);
    }

    return json(result);
  } catch (error) {
    if (error instanceof ShipmentProcessError) {
      return json({ error: error.code, details: error.details ?? null }, error.status);
    }

    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
