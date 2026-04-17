import { supabase } from "./supabaseClient";

export type PromoType = "single_use" | "multi_use";
export type PromoStatus = "active" | "disabled" | "exhausted";
export type PromoEffectiveStatus = PromoStatus | "expired";

export type AdminPromoStats = {
  confirmed_orders_count: number;
  sold_items_count: number;
  subtotal_without_discount_rub: number;
  promo_discount_amount_rub: number;
  subtotal_with_discount_rub: number;
};

export type AdminPromoListItem = {
  id: string;
  code: string;
  type: PromoType;
  discount_percent: number;
  status: PromoStatus;
  effective_status: PromoEffectiveStatus;
  active_from: string | null;
  active_to: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
  stats: AdminPromoStats;
};

export type AdminPromoDetailOrder = {
  order_id: string;
  finalized_at: string | null;
  tg_user_id: number;
  user: {
    telegram_username: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  items_count: number;
  order: {
    id: string;
    status: string;
    created_at: string;
    subtotal_without_discount_rub: number | null;
    promo_discount_amount_rub: number | null;
    subtotal_with_discount_rub: number | null;
  } | null;
};

export type AdminPromoDetail = {
  promo: {
    id: string;
    code: string;
    type: PromoType;
    discount_percent: number;
    status: PromoStatus;
    effective_status: PromoEffectiveStatus;
    active_from: string | null;
    active_to: string | null;
    expires_at?: string | null;
    created_at: string;
    updated_at: string;
  };
  stats: AdminPromoStats;
  orders: AdminPromoDetailOrder[];
};

export type UpsertPromoPayload = {
  id?: string | null;
  code: string;
  type: PromoType;
  discount_percent: number;
  status: PromoStatus;
  active_from?: string | null;
  active_to?: string | null;
  confirm_high_discount?: boolean;
};

function readAdminToken() {
  try {
    return (window.localStorage.getItem("tg_admin_session_token") ?? "").trim();
  } catch {
    return "";
  }
}

function buildAdminSessionHeaders(adminToken: string): Record<string, string> | undefined {
  if (!adminToken) return undefined;
  return {
    "x-admin-token": adminToken,
  };
}

export async function listAdminPromos(): Promise<AdminPromoListItem[]> {
  const adminToken = readAdminToken();
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    promos?: AdminPromoListItem[];
  }>("tg_admin_promo_codes", {
    body: { mode: "list" },
    headers: buildAdminSessionHeaders(adminToken),
  });
  if (error) throw error;
  if (!data?.ok || !Array.isArray(data.promos)) throw new Error("PROMO_LIST_FAILED");
  return data.promos;
}

export async function getAdminPromoDetail(id: string): Promise<AdminPromoDetail> {
  const adminToken = readAdminToken();
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    promo?: AdminPromoDetail["promo"];
    stats?: AdminPromoStats;
    orders?: AdminPromoDetailOrder[];
    error?: string;
  }>("tg_admin_promo_codes", {
    body: { mode: "detail", id },
    headers: buildAdminSessionHeaders(adminToken),
  });
  if (error) throw error;
  if (!data?.ok || !data.promo || !data.stats || !Array.isArray(data.orders)) {
    throw new Error(String(data?.error ?? "PROMO_DETAIL_FAILED"));
  }
  return {
    promo: data.promo,
    stats: data.stats,
    orders: data.orders,
  };
}

export async function upsertAdminPromo(payload: UpsertPromoPayload): Promise<AdminPromoListItem> {
  const adminToken = readAdminToken();
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    promo?: AdminPromoListItem;
    error?: string;
  }>("tg_admin_promo_codes", {
    body: {
      mode: "upsert",
      ...payload,
    },
    headers: buildAdminSessionHeaders(adminToken),
  });
  if (error) throw error;
  if (!data?.ok || !data.promo) {
    throw new Error(String(data?.error ?? "PROMO_UPSERT_FAILED"));
  }
  return data.promo;
}

export async function setAdminPromoStatus(id: string, status: PromoStatus): Promise<AdminPromoListItem> {
  const adminToken = readAdminToken();
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    promo?: AdminPromoListItem;
    error?: string;
  }>("tg_admin_promo_codes", {
    body: {
      mode: "set_status",
      id,
      status,
    },
    headers: buildAdminSessionHeaders(adminToken),
  });
  if (error) throw error;
  if (!data?.ok || !data.promo) {
    throw new Error(String(data?.error ?? "PROMO_SET_STATUS_FAILED"));
  }
  return data.promo;
}

export async function deleteAdminPromo(id: string): Promise<void> {
  const adminToken = readAdminToken();
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
  }>("tg_admin_promo_codes", {
    body: {
      mode: "delete",
      id,
    },
    headers: buildAdminSessionHeaders(adminToken),
  });
  if (error) throw error;
  if (!data?.ok) {
    throw new Error(String(data?.error ?? "PROMO_DELETE_FAILED"));
  }
}
