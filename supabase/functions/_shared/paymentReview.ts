export type RejectOrderPaymentResult = {
  ok: true;
  status: "rejected" | "already_rejected";
  order_id: string;
  previous_status: string;
  current_status: "rejected";
};

export async function rejectOrderPaymentForOrder(
  supabase: any,
  orderId: string,
  reason: string,
  nowIso = new Date().toISOString(),
): Promise<RejectOrderPaymentResult> {
  const { data: order, error: orderErr } = await supabase
    .from("tg_orders")
    .select("id, post_id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) {
    throw new Error(`ORDER_LOOKUP_FAILED:${orderErr.message}`);
  }
  if (!order) {
    throw new Error("ORDER_NOT_FOUND");
  }

  const previousStatus = String((order as Record<string, unknown>).status ?? "").trim();
  console.log(JSON.stringify({ scope: "payment", event: "order_reject_requested", orderId, previousStatus }));

  if (previousStatus === "rejected") {
    return { ok: true, status: "already_rejected", order_id: orderId, previous_status: "rejected", current_status: "rejected" };
  }

  if (previousStatus !== "payment_proof_submitted") {
    throw new Error(`ORDER_STATUS_NOT_REJECTABLE:${previousStatus}`);
  }

  const postId = String((order as Record<string, unknown>).post_id ?? "").trim();
  const { data: itemRows, error: itemsErr } = await supabase
    .from("tg_order_items")
    .select("post_id")
    .eq("order_id", orderId);

  if (itemsErr) {
    throw new Error(`ORDER_ITEMS_LOOKUP_FAILED:${itemsErr.message}`);
  }

  const orderPostIds = [...new Set(
    ((itemRows ?? []) as Array<{ post_id?: string | null }>)
      .map((row) => String(row.post_id ?? "").trim())
      .filter(Boolean),
  )];
  if (!orderPostIds.length && postId) {
    orderPostIds.push(postId);
  }

  const { data: updatedOrder, error: updateOrderErr } = await supabase
    .from("tg_orders")
    .update({
      status: "rejected",
      rejection_reason: reason,
      reserved_until: null,
    })
    .eq("id", orderId)
    .eq("status", "payment_proof_submitted")
    .select("id")
    .maybeSingle();

  if (updateOrderErr) {
    throw new Error(`ORDER_REJECT_UPDATE_FAILED:${updateOrderErr.message}`);
  }
  if (!updatedOrder) {
    throw new Error(`ORDER_STATUS_NOT_REJECTABLE:${previousStatus}`);
  }

  if (orderPostIds.length) {
    const { error: postErr } = await supabase
      .from("tg_posts")
      .update({
        sale_status: "available",
        reserved_until: null,
        reserved_order_id: null,
      })
      .in("id", orderPostIds)
      .eq("reserved_order_id", orderId);

    if (postErr) {
      throw new Error(`POST_RELEASE_FAILED:${postErr.message}`);
    }
  }

  const { error: eventErr } = await supabase.from("tg_order_events").insert({
    order_id: orderId,
    event: "rejected",
    payload: { at: nowIso, reason, previous_status: previousStatus, current_status: "rejected" },
  });

  if (eventErr) {
    throw new Error(`ORDER_EVENT_SAVE_FAILED:${eventErr.message}`);
  }

  console.log(JSON.stringify({ scope: "payment", event: "order_rejected", orderId, previousStatus, currentStatus: "rejected" }));
  return { ok: true, status: "rejected", order_id: orderId, previous_status: previousStatus, current_status: "rejected" };
}
