import {
  createSupabaseAdminClient,
  empty,
  getAdminToken,
  getOptionalSecret,
  getRequiredSecret,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";
import { syncActiveShipments } from "../_shared/cdekShipment.ts";

function getCronToken(req: Request) {
  return (
    req.headers.get("x-cron-secret") ??
    req.headers.get("x-sync-secret") ??
    ""
  ).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const configuredCronSecret = getOptionalSecret("SHIPMENT_SYNC_CRON_SECRET");
    const providedCronSecret = getCronToken(req);

    if (!configuredCronSecret || providedCronSecret !== configuredCronSecret) {
      const session = await requireAdminSession(supabase, req);
      if (!session.ok) return session.response;
    }

    const cdekProxyBaseUrl = getRequiredSecret("CDEK_PROXY_BASE_URL");
    const body = await req.json().catch(() => null) as { limit?: number } | null;
    const limit = Number(body?.limit ?? 20) || 20;

    console.log(JSON.stringify({
      scope: "shipment",
      event: "shipment_batch_sync_request",
      limit,
      hasAdminToken: Boolean(getAdminToken(req)),
      hasCronSecret: Boolean(providedCronSecret),
    }));

    const result = await syncActiveShipments(supabase, cdekProxyBaseUrl, limit);
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
