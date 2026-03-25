import {
  createSupabaseAdminClient,
  empty,
  getOptionalSecret,
  json,
} from "../_shared/admin.ts";
import { processShipmentWebhook } from "../_shared/cdekShipment.ts";

function getWebhookSecret(req: Request) {
  return (
    req.headers.get("x-cdek-webhook-secret") ??
    req.headers.get("x-webhook-secret") ??
    ""
  ).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const configuredSecret = getOptionalSecret("CDEK_WEBHOOK_SECRET");
    if (configuredSecret) {
      const providedSecret = getWebhookSecret(req);
      if (!providedSecret || providedSecret !== configuredSecret) {
        return json({ error: "UNAUTHORIZED" }, 401);
      }
    }

    const payload = await req.json().catch(() => null);
    if (!payload) {
      return json({ error: "BAD_PAYLOAD" }, 400);
    }

    const supabase = createSupabaseAdminClient();
    const result = await processShipmentWebhook(supabase, payload);
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
