import {
  createSupabaseAdminClient,
  empty,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";
import { resolvePromoEffectiveStatus } from "../_shared/promo.ts";

type AdminPromoMode = "list" | "detail" | "upsert" | "delete" | "set_status";

type AdminPromoBody = {
  mode?: AdminPromoMode;
  id?: string | null;
  code?: string | null;
  type?: "single_use" | "multi_use" | null;
  discount_percent?: number | null;
  status?: "active" | "disabled" | "exhausted" | null;
  expires_at?: string | null;
  confirm_high_discount?: boolean;
};

type PromoRow = {
  id: string;
  code: string;
  type: "single_use" | "multi_use";
  discount_percent: number;
  status: "active" | "disabled" | "exhausted";
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function normalizeId(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeCode(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function toIsoOrNull(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("PROMO_EXPIRES_AT_INVALID");
  }
  return date.toISOString();
}

function validatePromoType(value: unknown): "single_use" | "multi_use" {
  const normalized = String(value ?? "").trim();
  if (normalized === "single_use" || normalized === "multi_use") return normalized;
  throw new Error("PROMO_TYPE_INVALID");
}

function validatePromoStatus(value: unknown): "active" | "disabled" | "exhausted" {
  const normalized = String(value ?? "").trim();
  if (normalized === "active" || normalized === "disabled" || normalized === "exhausted") return normalized;
  throw new Error("PROMO_STATUS_INVALID");
}

function validateDiscountPercent(value: unknown): number {
  const parsed = Math.round(Number(value ?? 0));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 95) {
    throw new Error("PROMO_PERCENT_INVALID");
  }
  return parsed;
}

function buildOrderStatsMap(
  usageRows: Array<{ promo_id: string; order_id: string; tg_orders: Record<string, unknown> | null }>,
  itemCountsByOrderId: Map<string, number>,
) {
  const stats = new Map<string, {
    confirmed_orders_count: number;
    sold_items_count: number;
    subtotal_without_discount_rub: number;
    promo_discount_amount_rub: number;
    subtotal_with_discount_rub: number;
  }>();

  for (const usageRow of usageRows) {
    const promoId = String(usageRow.promo_id ?? "").trim();
    if (!promoId) continue;
    const orderId = String(usageRow.order_id ?? "").trim();
    const order = usageRow.tg_orders ?? {};
    const current = stats.get(promoId) ?? {
      confirmed_orders_count: 0,
      sold_items_count: 0,
      subtotal_without_discount_rub: 0,
      promo_discount_amount_rub: 0,
      subtotal_with_discount_rub: 0,
    };
    current.confirmed_orders_count += 1;
    current.sold_items_count += itemCountsByOrderId.get(orderId) ?? 0;
    current.subtotal_without_discount_rub += Number(order.subtotal_without_discount_rub ?? 0);
    current.promo_discount_amount_rub += Number(order.promo_discount_amount_rub ?? 0);
    current.subtotal_with_discount_rub += Number(order.subtotal_with_discount_rub ?? 0);
    stats.set(promoId, current);
  }

  return stats;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const adminSession = await requireAdminSession(supabase, req);
    if (!adminSession.ok) return adminSession.response;

    const body = (await req.json().catch(() => null)) as AdminPromoBody | null;
    const mode = String(body?.mode ?? "").trim() as AdminPromoMode;

    if (mode === "list") {
      const { data, error } = await supabase
        .from("tg_promo_codes")
        .select("id, code, type, discount_percent, status, expires_at, created_at, updated_at, deleted_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) return json({ error: "PROMO_LIST_FAILED", details: error.message }, 500);

      const promos = (data ?? []) as PromoRow[];
      const promoIds = promos.map((row) => row.id);
      let usageRows: Array<{ promo_id: string; order_id: string; tg_orders: Record<string, unknown> | null }> = [];
      if (promoIds.length) {
        const { data: usagesData, error: usagesError } = await supabase
          .from("tg_promo_usages")
          .select("promo_id, order_id, tg_orders(subtotal_without_discount_rub,promo_discount_amount_rub,subtotal_with_discount_rub)")
          .in("promo_id", promoIds)
          .eq("is_final", true);
        if (usagesError) return json({ error: "PROMO_USAGE_LIST_FAILED", details: usagesError.message }, 500);
        usageRows = (usagesData ?? []) as Array<{ promo_id: string; order_id: string; tg_orders: Record<string, unknown> | null }>;
      }

      const orderIds = [...new Set(usageRows.map((row) => String(row.order_id ?? "").trim()).filter(Boolean))];
      const itemCountsByOrderId = new Map<string, number>();
      if (orderIds.length) {
        const { data: itemsData, error: itemsError } = await supabase
          .from("tg_order_items")
          .select("order_id")
          .in("order_id", orderIds);
        if (itemsError) return json({ error: "PROMO_ORDER_ITEMS_FAILED", details: itemsError.message }, 500);
        for (const row of (itemsData ?? []) as Array<{ order_id: string }>) {
          const orderId = String(row.order_id ?? "").trim();
          if (!orderId) continue;
          itemCountsByOrderId.set(orderId, (itemCountsByOrderId.get(orderId) ?? 0) + 1);
        }
      }

      const statsByPromo = buildOrderStatsMap(usageRows, itemCountsByOrderId);
      const mapped = promos.map((row) => ({
        ...row,
        effective_status: resolvePromoEffectiveStatus(row),
        stats: statsByPromo.get(row.id) ?? {
          confirmed_orders_count: 0,
          sold_items_count: 0,
          subtotal_without_discount_rub: 0,
          promo_discount_amount_rub: 0,
          subtotal_with_discount_rub: 0,
        },
      }));

      return json({ ok: true, promos: mapped });
    }

    if (mode === "detail") {
      const promoId = normalizeId(body?.id);
      if (!promoId) return json({ error: "BAD_PAYLOAD" }, 400);

      const { data: promoData, error: promoError } = await supabase
        .from("tg_promo_codes")
        .select("id, code, type, discount_percent, status, expires_at, created_at, updated_at, deleted_at")
        .eq("id", promoId)
        .is("deleted_at", null)
        .maybeSingle();
      if (promoError) return json({ error: "PROMO_DETAIL_FAILED", details: promoError.message }, 500);
      if (!promoData) return json({ error: "PROMO_NOT_FOUND" }, 404);

      const promo = promoData as PromoRow;

      const { data: usagesData, error: usagesError } = await supabase
        .from("tg_promo_usages")
        .select("order_id, tg_user_id, finalized_at, tg_orders(id,status,created_at,subtotal_without_discount_rub,promo_discount_amount_rub,subtotal_with_discount_rub)")
        .eq("promo_id", promoId)
        .eq("is_final", true)
        .order("finalized_at", { ascending: false });
      if (usagesError) return json({ error: "PROMO_DETAIL_USAGES_FAILED", details: usagesError.message }, 500);

      const usageRows = (usagesData ?? []) as Array<{
        order_id: string;
        tg_user_id: number;
        finalized_at: string | null;
        tg_orders: Record<string, unknown> | null;
      }>;

      const orderIds = [...new Set(usageRows.map((row) => String(row.order_id ?? "").trim()).filter(Boolean))];
      const itemCountsByOrderId = new Map<string, number>();
      if (orderIds.length) {
        const { data: itemsData, error: itemsError } = await supabase
          .from("tg_order_items")
          .select("order_id")
          .in("order_id", orderIds);
        if (itemsError) return json({ error: "PROMO_DETAIL_ITEMS_FAILED", details: itemsError.message }, 500);
        for (const row of (itemsData ?? []) as Array<{ order_id: string }>) {
          const orderId = String(row.order_id ?? "").trim();
          if (!orderId) continue;
          itemCountsByOrderId.set(orderId, (itemCountsByOrderId.get(orderId) ?? 0) + 1);
        }
      }

      const tgUserIds = [...new Set(usageRows.map((row) => Number(row.tg_user_id ?? 0)).filter((value) => Number.isFinite(value) && value > 0))];
      const usersById = new Map<number, { telegram_username: string | null; first_name: string | null; last_name: string | null }>();
      if (tgUserIds.length) {
        const { data: usersData, error: usersError } = await supabase
          .from("tg_users")
          .select("telegram_id, telegram_username, first_name, last_name")
          .in("telegram_id", tgUserIds);
        if (usersError) return json({ error: "PROMO_DETAIL_USERS_FAILED", details: usersError.message }, 500);
        for (const userRow of (usersData ?? []) as Array<{
          telegram_id: number;
          telegram_username: string | null;
          first_name: string | null;
          last_name: string | null;
        }>) {
          usersById.set(Number(userRow.telegram_id), {
            telegram_username: userRow.telegram_username ?? null,
            first_name: userRow.first_name ?? null,
            last_name: userRow.last_name ?? null,
          });
        }
      }

      const orders = usageRows.map((row) => {
        const user = usersById.get(Number(row.tg_user_id)) ?? null;
        return {
          order_id: row.order_id,
          finalized_at: row.finalized_at,
          tg_user_id: row.tg_user_id,
          user,
          items_count: itemCountsByOrderId.get(String(row.order_id ?? "").trim()) ?? 0,
          order: row.tg_orders ?? null,
        };
      });

      const stats = orders.reduce((acc, row) => {
        const order = row.order ?? {};
        acc.confirmed_orders_count += 1;
        acc.sold_items_count += Number(row.items_count ?? 0);
        acc.subtotal_without_discount_rub += Number(order.subtotal_without_discount_rub ?? 0);
        acc.promo_discount_amount_rub += Number(order.promo_discount_amount_rub ?? 0);
        acc.subtotal_with_discount_rub += Number(order.subtotal_with_discount_rub ?? 0);
        return acc;
      }, {
        confirmed_orders_count: 0,
        sold_items_count: 0,
        subtotal_without_discount_rub: 0,
        promo_discount_amount_rub: 0,
        subtotal_with_discount_rub: 0,
      });

      return json({
        ok: true,
        promo: {
          ...promo,
          effective_status: resolvePromoEffectiveStatus(promo),
        },
        stats,
        orders,
      });
    }

    if (mode === "upsert") {
      const id = normalizeId(body?.id);
      const code = normalizeCode(body?.code);
      const type = validatePromoType(body?.type);
      const discountPercent = validateDiscountPercent(body?.discount_percent);
      const status = body?.status ? validatePromoStatus(body.status) : "active";
      const expiresAt = toIsoOrNull(body?.expires_at);
      const highDiscountConfirmed = Boolean(body?.confirm_high_discount);

      if (!code) return json({ ok: false, error: "PROMO_CODE_REQUIRED" }, 400);
      if (discountPercent > 15 && !highDiscountConfirmed) {
        return json({ ok: false, error: "PROMO_DISCOUNT_CONFIRM_REQUIRED" }, 200);
      }

      if (!id) {
        const { data, error } = await supabase
          .from("tg_promo_codes")
          .insert({
            code,
            type,
            discount_percent: discountPercent,
            status,
            expires_at: expiresAt,
            deleted_at: null,
          })
          .select("id, code, type, discount_percent, status, expires_at, created_at, updated_at, deleted_at")
          .single();
        if (error) {
          if (String(error.message ?? "").toLowerCase().includes("tg_promo_codes_code_lower_uidx")) {
            return json({ ok: false, error: "PROMO_CODE_EXISTS" }, 200);
          }
          return json({ error: "PROMO_CREATE_FAILED", details: error.message }, 500);
        }
        const row = data as PromoRow;
        return json({ ok: true, promo: { ...row, effective_status: resolvePromoEffectiveStatus(row) } });
      }

      const { data, error } = await supabase
        .from("tg_promo_codes")
        .update({
          code,
          type,
          discount_percent: discountPercent,
          status,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .is("deleted_at", null)
        .select("id, code, type, discount_percent, status, expires_at, created_at, updated_at, deleted_at")
        .maybeSingle();

      if (error) {
        if (String(error.message ?? "").toLowerCase().includes("tg_promo_codes_code_lower_uidx")) {
          return json({ ok: false, error: "PROMO_CODE_EXISTS" }, 200);
        }
        return json({ error: "PROMO_UPDATE_FAILED", details: error.message }, 500);
      }
      if (!data) return json({ ok: false, error: "PROMO_NOT_FOUND" }, 404);
      const row = data as PromoRow;
      return json({ ok: true, promo: { ...row, effective_status: resolvePromoEffectiveStatus(row) } });
    }

    if (mode === "set_status") {
      const id = normalizeId(body?.id);
      const status = validatePromoStatus(body?.status);
      if (!id) return json({ error: "BAD_PAYLOAD" }, 400);

      const { data, error } = await supabase
        .from("tg_promo_codes")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .is("deleted_at", null)
        .select("id, code, type, discount_percent, status, expires_at, created_at, updated_at, deleted_at")
        .maybeSingle();
      if (error) return json({ error: "PROMO_SET_STATUS_FAILED", details: error.message }, 500);
      if (!data) return json({ ok: false, error: "PROMO_NOT_FOUND" }, 404);
      const row = data as PromoRow;
      return json({ ok: true, promo: { ...row, effective_status: resolvePromoEffectiveStatus(row) } });
    }

    if (mode === "delete") {
      const id = normalizeId(body?.id);
      if (!id) return json({ error: "BAD_PAYLOAD" }, 400);

      const { error } = await supabase
        .from("tg_promo_codes")
        .update({
          deleted_at: new Date().toISOString(),
          status: "disabled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .is("deleted_at", null);
      if (error) return json({ error: "PROMO_DELETE_FAILED", details: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "BAD_PAYLOAD" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (
      message === "PROMO_TYPE_INVALID"
      || message === "PROMO_STATUS_INVALID"
      || message === "PROMO_PERCENT_INVALID"
      || message === "PROMO_EXPIRES_AT_INVALID"
    ) {
      return json({ ok: false, error: message }, 400);
    }
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
