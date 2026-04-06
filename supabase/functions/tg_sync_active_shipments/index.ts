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
    const body = await req.json().catch(() => null) as { limit?: number; max_total?: number } | null;
    const limit = Number(body?.limit ?? 20) || 20;
    const maxTotal = Math.max(limit, Math.min(Number(body?.max_total ?? 500) || 500, 1000));

    console.log(JSON.stringify({
      scope: "shipment",
      event: "shipment_batch_sync_request",
      limit,
      maxTotal,
      hasAdminToken: Boolean(getAdminToken(req)),
      hasCronSecret: Boolean(providedCronSecret),
    }));

    const processedOrderIds = new Set<string>();
    const items: Array<{
      order_id: string;
      cdek_uuid: string | null;
      status: "updated" | "unchanged" | "skipped" | "failed";
      reason?: "final_status";
      cdek_track_number?: string | null;
      cdek_status?: string | null;
      error?: string;
    }> = [];

    while (processedOrderIds.size < maxTotal) {
      const chunkLimit = Math.max(1, Math.min(limit, maxTotal - processedOrderIds.size));
      const chunk = await syncActiveShipments(supabase, cdekProxyBaseUrl, chunkLimit, processedOrderIds);
      if (!chunk.processed) {
        break;
      }

      for (const item of chunk.items) {
        const orderId = String(item.order_id ?? "").trim();
        if (!orderId || processedOrderIds.has(orderId)) continue;
        processedOrderIds.add(orderId);
        items.push(item);
      }

      if (chunk.processed < chunkLimit) {
        break;
      }
    }

    const result = {
      ok: true as const,
      limit,
      processed: items.length,
      updated: items.filter((item) => item.status === "updated").length,
      unchanged: items.filter((item) => item.status === "unchanged").length,
      skipped: items.filter((item) => item.status === "skipped").length,
      failed: items.filter((item) => item.status === "failed").length,
      items,
    };

    console.log(JSON.stringify({
      scope: "shipment",
      event: "shipment_batch_sync_request_completed",
      limit,
      maxTotal,
      processed: result.processed,
      updated: result.updated,
      unchanged: result.unchanged,
      skipped: result.skipped,
      failed: result.failed,
    }));

    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
