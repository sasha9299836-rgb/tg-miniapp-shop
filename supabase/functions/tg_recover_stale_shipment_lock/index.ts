import {
  createSupabaseAdminClient,
  empty,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";
import { recoverStaleShipmentCreateLock } from "../_shared/cdekShipment.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const session = await requireAdminSession(supabase, req);
    if (!session.ok) return session.response;

    const body = await req.json().catch(() => null) as { order_id?: string } | null;
    const orderId = String(body?.order_id ?? "").trim();
    if (!orderId) return json({ error: "BAD_PAYLOAD" }, 400);

    console.log(JSON.stringify({ scope: "shipment", event: "shipment_lock_recovery_request", orderId }));
    const result = await recoverStaleShipmentCreateLock(supabase, orderId);
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
