export type ExpireOrdersResult = {
  dueCount: number;
  expiredCount: number;
  orderIds: string[];
  failed: Array<{ orderId: string; reason: string }>;
};

const EXPIRABLE_ORDER_STATUSES = ["created", "awaiting_payment_proof"] as const;

export async function expirePendingOrders(
  supabase: any,
  nowIso = new Date().toISOString(),
): Promise<ExpireOrdersResult> {
  console.log(
    JSON.stringify({
      scope: "payment",
      event: "order_expiration_started",
      expirableStatuses: [...EXPIRABLE_ORDER_STATUSES],
      nowIso,
    }),
  );

  const { data: dueOrders, error: dueError } = await supabase
    .from("tg_orders")
    .select("id, post_id, status, reserved_until")
    .in("status", [...EXPIRABLE_ORDER_STATUSES])
    .lte("reserved_until", nowIso);

  if (dueError) {
    throw new Error(`SELECT_FAILED:${dueError.message}`);
  }

  const due = (dueOrders ?? []) as Array<{ id: string; post_id: string; status: string; reserved_until: string | null }>;
  if (!due.length) {
    console.log(JSON.stringify({ scope: "payment", event: "order_expiration_completed", dueCount: 0, expiredCount: 0 }));
    return { dueCount: 0, expiredCount: 0, orderIds: [], failed: [] };
  }

  let expiredCount = 0;
  const orderIds: string[] = [];
  const failed: Array<{ orderId: string; reason: string }> = [];

  const dueOrderIds = due.map((order) => order.id);
  const { data: itemRows, error: itemsError } = await supabase
    .from("tg_order_items")
    .select("order_id, post_id")
    .in("order_id", dueOrderIds);

  if (itemsError) {
    throw new Error(`ORDER_ITEMS_LOOKUP_FAILED:${itemsError.message}`);
  }

  const orderPosts = new Map<string, string[]>();
  for (const row of (itemRows ?? []) as Array<{ order_id?: string | null; post_id?: string | null }>) {
    const orderId = String(row.order_id ?? "").trim();
    const postId = String(row.post_id ?? "").trim();
    if (!orderId || !postId) continue;
    const current = orderPosts.get(orderId) ?? [];
    if (!current.includes(postId)) current.push(postId);
    orderPosts.set(orderId, current);
  }

  for (const order of due) {
    const { data: updatedOrder, error: updateOrderError } = await supabase
      .from("tg_orders")
      .update({
        status: "expired",
        updated_at: nowIso,
        reserved_until: null,
      })
      .eq("id", order.id)
      .in("status", [...EXPIRABLE_ORDER_STATUSES])
      .select("id")
      .maybeSingle();

    if (updateOrderError) {
      failed.push({ orderId: order.id, reason: updateOrderError.message });
      continue;
    }

    if (!updatedOrder) {
      failed.push({ orderId: order.id, reason: "ORDER_NO_LONGER_EXPIRABLE" });
      continue;
    }

    const postIds = orderPosts.get(order.id) ?? (order.post_id ? [order.post_id] : []);
    const { error: releaseError } = await supabase
      .from("tg_posts")
      .update({
        sale_status: "available",
        reserved_until: null,
        reserved_order_id: null,
      })
      .in("id", postIds)
      .eq("reserved_order_id", order.id);

    if (releaseError) {
      failed.push({ orderId: order.id, reason: releaseError.message });
      continue;
    }

    const { error: eventError } = await supabase.from("tg_order_events").insert({
      order_id: order.id,
      event: "expired",
      payload: {
        at: nowIso,
        previous_status: order.status,
        current_status: "expired",
      },
    });

    if (eventError) {
      failed.push({ orderId: order.id, reason: eventError.message });
      continue;
    }

    expiredCount += 1;
    orderIds.push(order.id);
    console.log(
      JSON.stringify({
        scope: "payment",
        event: "order_expired",
        orderId: order.id,
        previousStatus: order.status,
        currentStatus: "expired",
      }),
    );
  }

  console.log(
    JSON.stringify({
      scope: "payment",
      event: "order_expiration_completed",
      dueCount: due.length,
      expiredCount,
      orderIds,
      failed,
    }),
  );

  return { dueCount: due.length, expiredCount, orderIds, failed };
}
