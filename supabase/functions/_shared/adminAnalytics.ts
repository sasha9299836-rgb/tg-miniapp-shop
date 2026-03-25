export type AdminAnalyticsRange = "today" | "7d" | "30d" | "all";

type AnalyticsOrderRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  payment_confirmed_at: string | null;
  price_rub: number | null;
  fio: string | null;
  delivery_type: string | null;
  cdek_uuid: string | null;
  cdek_status: string | null;
  cdek_track_number: string | null;
  shipment_create_in_progress: boolean | null;
};

type AnalyticsSaleRow = {
  order_id: string;
  sale_price_rub: number | null;
  created_at?: string | null;
  sale_date?: string | null;
};

export type AdminAnalyticsListItem = {
  order_id: string;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  payment_confirmed_at: string | null;
  fio: string | null;
  price_rub: number | null;
  delivery_type: string | null;
  cdek_status: string | null;
  cdek_track_number: string | null;
};

export type AdminAnalyticsSnapshot = {
  ok: true;
  range: AdminAnalyticsRange;
  generated_at: string;
  period_start: string | null;
  summary: {
    total_revenue_rub: number;
    paid_orders_count: number;
    completed_orders_count: number;
    ready_for_pickup_count: number;
    active_deliveries_count: number;
    awaiting_payment_review_count: number;
    rejected_or_expired_count: number;
  };
  lists: {
    latest_paid_orders: AdminAnalyticsListItem[];
    awaiting_payment_review_orders: AdminAnalyticsListItem[];
    ready_for_pickup_orders: AdminAnalyticsListItem[];
    problem_orders: AdminAnalyticsListItem[];
  };
};

function normalizeRange(value: unknown): AdminAnalyticsRange {
  const raw = String(value ?? "").trim();
  if (raw === "today" || raw === "7d" || raw === "30d" || raw === "all") return raw;
  return "7d";
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getPeriodStart(range: AdminAnalyticsRange, nowIso: string): string | null {
  const now = new Date(nowIso);
  if (!Number.isFinite(now.getTime())) return null;
  if (range === "all") return null;
  if (range === "today") return startOfDay(now).toISOString();
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function timestampInRange(value: string | null | undefined, start: string | null): boolean {
  if (!start) return true;
  if (!value) return false;
  return value >= start;
}

function toListItem(order: AnalyticsOrderRow): AdminAnalyticsListItem {
  return {
    order_id: order.id,
    status: order.status,
    created_at: order.created_at,
    updated_at: order.updated_at,
    payment_confirmed_at: order.payment_confirmed_at,
    fio: order.fio,
    price_rub: order.price_rub,
    delivery_type: order.delivery_type,
    cdek_status: order.cdek_status,
    cdek_track_number: order.cdek_track_number,
  };
}

function byDescDate(selector: (item: AnalyticsOrderRow) => string | null | undefined) {
  return (left: AnalyticsOrderRow, right: AnalyticsOrderRow) =>
    new Date(selector(right) ?? 0).getTime() - new Date(selector(left) ?? 0).getTime();
}

function isFinalShipmentStatus(status: string | null | undefined) {
  return status === "DELIVERED" || status === "CANCELLED";
}

function isProblemOrder(order: AnalyticsOrderRow) {
  if (order.status === "rejected" || order.status === "expired") return true;
  return Boolean(order.shipment_create_in_progress && !order.cdek_uuid);
}

export function buildAdminAnalyticsSnapshot(
  orders: AnalyticsOrderRow[],
  sales: AnalyticsSaleRow[],
  rangeInput: unknown,
  nowIso = new Date().toISOString(),
): AdminAnalyticsSnapshot {
  const range = normalizeRange(rangeInput);
  const periodStart = getPeriodStart(range, nowIso);

  const revenueSales = sales.filter((sale) => {
    const anchor = sale.created_at ?? (sale.sale_date ? `${sale.sale_date}T00:00:00.000Z` : null);
    return timestampInRange(anchor, periodStart);
  });

  const ordersCreatedInRange = orders.filter((order) => timestampInRange(order.created_at, periodStart));
  const paidOrders = orders.filter((order) =>
    ["paid", "ready_for_pickup", "completed"].includes(String(order.status ?? "")) &&
    timestampInRange(order.payment_confirmed_at, periodStart)
  );

  const completedOrders = orders.filter((order) =>
    order.status === "completed" && timestampInRange(order.updated_at ?? order.payment_confirmed_at, periodStart)
  );

  const readyOrders = orders.filter((order) =>
    order.status === "ready_for_pickup" && timestampInRange(order.updated_at ?? order.payment_confirmed_at, periodStart)
  );

  const activeDeliveries = orders.filter((order) =>
    Boolean(order.cdek_uuid) &&
    !isFinalShipmentStatus(order.cdek_status) &&
    timestampInRange(order.payment_confirmed_at ?? order.created_at, periodStart)
  );

  const awaitingReviewOrders = ordersCreatedInRange.filter((order) => order.status === "payment_proof_submitted");
  const rejectedOrExpiredOrders = ordersCreatedInRange.filter((order) => order.status === "rejected" || order.status === "expired");

  const latestPaidOrders = [...paidOrders]
    .sort(byDescDate((order) => order.payment_confirmed_at ?? order.updated_at ?? order.created_at))
    .slice(0, 5)
    .map(toListItem);

  const awaitingReviewList = [...awaitingReviewOrders]
    .sort(byDescDate((order) => order.created_at))
    .slice(0, 5)
    .map(toListItem);

  const readyList = [...readyOrders]
    .sort(byDescDate((order) => order.updated_at ?? order.created_at))
    .slice(0, 5)
    .map(toListItem);

  const problemList = [...ordersCreatedInRange.filter(isProblemOrder)]
    .sort(byDescDate((order) => order.updated_at ?? order.created_at))
    .slice(0, 5)
    .map(toListItem);

  return {
    ok: true,
    range,
    generated_at: nowIso,
    period_start: periodStart,
    summary: {
      total_revenue_rub: revenueSales.reduce((sum, sale) => sum + Number(sale.sale_price_rub ?? 0), 0),
      paid_orders_count: paidOrders.length,
      completed_orders_count: completedOrders.length,
      ready_for_pickup_count: readyOrders.length,
      active_deliveries_count: activeDeliveries.length,
      awaiting_payment_review_count: awaitingReviewOrders.length,
      rejected_or_expired_count: rejectedOrExpiredOrders.length,
    },
    lists: {
      latest_paid_orders: latestPaidOrders,
      awaiting_payment_review_orders: awaitingReviewList,
      ready_for_pickup_orders: readyList,
      problem_orders: problemList,
    },
  };
}

export async function fetchAdminAnalytics(
  supabase: any,
  rangeInput: unknown,
  nowIso = new Date().toISOString(),
): Promise<AdminAnalyticsSnapshot> {
  const { data: orders, error: ordersError } = await supabase
    .from("tg_orders")
    .select("id,status,created_at,updated_at,payment_confirmed_at,price_rub,fio,delivery_type,cdek_uuid,cdek_status,cdek_track_number,shipment_create_in_progress");

  if (ordersError) {
    throw new Error(`ORDERS_ANALYTICS_LOAD_FAILED:${ordersError.message}`);
  }

  const { data: sales, error: salesError } = await supabase
    .from("tg_sales")
    .select("order_id,sale_price_rub,created_at,sale_date");

  if (salesError) {
    throw new Error(`SALES_ANALYTICS_LOAD_FAILED:${salesError.message}`);
  }

  return buildAdminAnalyticsSnapshot(
    (orders ?? []) as AnalyticsOrderRow[],
    (sales ?? []) as AnalyticsSaleRow[],
    rangeInput,
    nowIso,
  );
}
