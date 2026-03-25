import {
  createSupabaseAdminClient,
  empty,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";
import { fetchAdminAnalytics } from "../_shared/adminAnalytics.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const session = await requireAdminSession(supabase, req);
    if (!session.ok) return session.response;

    const body = await req.json().catch(() => null) as { range?: string } | null;
    const range = String(body?.range ?? "7d").trim();

    console.log(JSON.stringify({ scope: "analytics", event: "admin_analytics_requested", range }));
    const result = await fetchAdminAnalytics(supabase, range);
    console.log(
      JSON.stringify({
        scope: "analytics",
        event: "admin_analytics_completed",
        range: result.range,
        revenue: result.summary.total_revenue_rub,
        paidOrders: result.summary.paid_orders_count,
        awaitingReview: result.summary.awaiting_payment_review_count,
      }),
    );

    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("ORDERS_ANALYTICS_LOAD_FAILED:")) {
      return json({ error: "ORDERS_ANALYTICS_LOAD_FAILED", details: message.slice("ORDERS_ANALYTICS_LOAD_FAILED:".length) }, 500);
    }
    if (message.startsWith("SALES_ANALYTICS_LOAD_FAILED:")) {
      return json({ error: "SALES_ANALYTICS_LOAD_FAILED", details: message.slice("SALES_ANALYTICS_LOAD_FAILED:".length) }, 500);
    }
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
