import { supabase } from "./supabaseClient";
import { TG_IDENTITY_REQUIRED_ERROR } from "../auth/tgUser";
import { ensureTelegramUserSessionToken } from "../auth/tgUserSession";

export const TG_LAST_ORDER_ID_KEY = "tg_last_order_id";
export const TG_CHECKOUT_PROMO_KEY = "tg_checkout_promo_snapshot";

export type TgOrderStatus =
  | "created"
  | "awaiting_payment_proof"
  | "payment_proof_submitted"
  | "payment_confirmed"
  | "paid"
  | "ready_for_pickup"
  | "completed"
  | "rejected"
  | "expired"
  | "cancelled";

export type DeliveryType = "pickup" | "door";
export type PackagingType = "standard" | "box";
export type PackagingPreset = "A2" | "A3" | "A4";
export type ShippingOriginProfile = "ODN" | "YAN";

export type TgOrder = {
  id: string;
  tg_user_id: number;
  post_id: string;
  status: TgOrderStatus;
  reserved_until: string | null;
  created_at: string;
  updated_at: string;
  price_rub: number | null;
  delivery_type: DeliveryType;
  fio: string;
  phone: string;
  city: string | null;
  cdek_pvz_code: string | null;
  cdek_pvz_address: string | null;
  street: string | null;
  house: string | null;
  entrance: string | null;
  apartment: string | null;
  floor: string | null;
  rejection_reason: string | null;
  payment_proof_key: string | null;
  payment_proof_uploaded_at: string | null;
  payment_confirmed_at: string | null;
  packaging_type?: PackagingType | null;
  packaging_fee_rub?: number | null;
  packaging_preset?: PackagingPreset | null;
  pvz?: string | null;
  address_preset_id?: string | null;
  origin_profile?: ShippingOriginProfile | null;
  receiver_city_code?: string | null;
  delivery_point?: string | null;
  package_weight?: number | null;
  package_length?: number | null;
  package_width?: number | null;
  package_height?: number | null;
  cdek_uuid?: string | null;
  cdek_track_number?: string | null;
  cdek_status?: string | null;
  cdek_tariff_code?: number | null;
  delivery_base_fee_rub?: number | null;
  delivery_markup_rub?: number | null;
  delivery_total_fee_rub?: number | null;
  shipment_create_in_progress?: boolean | null;
  shipment_create_started_at?: string | null;
  price?: number | null;
  promo_id?: string | null;
  promo_code?: string | null;
  promo_type?: "single_use" | "multi_use" | null;
  promo_discount_percent?: number | null;
  subtotal_without_discount_rub?: number | null;
  promo_discount_amount_rub?: number | null;
  subtotal_with_discount_rub?: number | null;
  final_total_rub?: number | null;
  loyalty_level?: number | null;
  loyalty_discount_kind?: "none" | "level1_one_time" | "level4_permanent" | "level5_permanent" | null;
  loyalty_discount_percent?: number | null;
  loyalty_discount_amount_rub?: number | null;
  delivery_discount_amount_rub?: number | null;
  subtotal_with_all_discounts_rub?: number | null;
};

export type PromoPreviewSnapshot = {
  promo_id: string | null;
  promo_code: string | null;
  promo_type: "single_use" | "multi_use" | null;
  promo_discount_percent: number | null;
  subtotal_without_discount_rub: number;
  promo_discount_amount_rub: number;
  subtotal_with_discount_rub: number;
  loyalty_level: number;
  loyalty_discount_kind: "none" | "level1_one_time" | "level4_permanent" | "level5_permanent";
  loyalty_discount_percent: number | null;
  loyalty_discount_amount_rub: number;
  delivery_total_fee_rub: number;
  delivery_discount_amount_rub: number;
  subtotal_with_all_discounts_rub: number;
  final_total_rub: number;
};

export type TgOrderTimelineEvent = {
  status: TgOrderStatus;
  changed_at: string;
  source: string;
  meta: Record<string, unknown>;
};

export type TgOrderWithTimeline = {
  order: TgOrder;
  timeline: TgOrderTimelineEvent[];
};

export type OrdersActorContext = "user" | "admin";

export type ShipmentStatusHistoryEntry = {
  id: string;
  order_id: string;
  cdek_uuid: string | null;
  cdek_status: string | null;
  cdek_track_number: string | null;
  event_source: "webhook" | "manual_sync" | "scheduled_sync" | "create_poll";
  event_key?: string | null;
  status_code?: string | null;
  status_name?: string | null;
  status_date_time?: string | null;
  status_datetime?: string | null;
  city?: string | null;
  created_at: string;
};

export type AdminOrderEvent = {
  id: number;
  order_id: string;
  event: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type CreateOrderPayload = {
  post_ids: string[];
  delivery_type: DeliveryType;
  fio: string;
  phone: string;
  city?: string | null;
  cdek_pvz_code?: string | null;
  cdek_pvz_address?: string | null;
  receiver_city_code?: string | null;
  delivery_point?: string | null;
  packaging_type?: PackagingType;
  address_preset_id?: string | null;
  street?: string | null;
  house?: string | null;
  entrance?: string | null;
  apartment?: string | null;
  floor?: string | null;
  delivery_base_fee_rub: number;
  delivery_markup_rub: number;
  delivery_total_fee_rub: number;
  promo_code?: string | null;
};

export type TgOrderItem = {
  id: string;
  order_id: string;
  post_id: string;
  price_rub: number;
  position_index?: number | null;
  created_at: string;
};

export type TgOrderShipment = {
  id: string;
  order_id: string;
  origin_profile: ShippingOriginProfile;
  cdek_uuid: string | null;
  cdek_track_number: string | null;
  cdek_status: string | null;
  cdek_tariff_code: number | null;
  last_cdek_status_payload?: Record<string, unknown> | null;
  last_cdek_status_synced_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type TgOrderOriginItem = {
  post_id: string;
  price_rub: number;
  origin_profile: ShippingOriginProfile;
  position_index?: number | null;
};

export type TgOrderPaymentContext = {
  order: TgOrder | null;
  orderItems: TgOrderOriginItem[];
};

export type DeliveryQuoteResult = {
  ok: true;
  post_ids: string[];
  originProfileUsed: ShippingOriginProfile;
  packagingPresetUsed: PackagingPreset;
  selectedTariffCode: number | null;
  delivery_base_fee_rub: number;
  delivery_markup_rub: number;
  package_fee_rub: number;
  delivery_total_fee_rub: number;
  package: {
    weight: number;
    length: number;
    width: number;
    height: number;
  };
};

function ensureTgUserId(tgUserId: number): number {
  if (Number.isInteger(tgUserId) && tgUserId > 0) return tgUserId;
  throw new Error(TG_IDENTITY_REQUIRED_ERROR);
}

export function saveLastOrderId(orderId: string) {
  try {
    window.localStorage.setItem(TG_LAST_ORDER_ID_KEY, orderId);
  } catch {
    // ignore
  }
}

export function readLastOrderId(): string | null {
  try {
    const raw = window.localStorage.getItem(TG_LAST_ORDER_ID_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function clearLastOrderId() {
  try {
    window.localStorage.removeItem(TG_LAST_ORDER_ID_KEY);
  } catch {
    // ignore
  }
}

export async function createOrder(payload: CreateOrderPayload): Promise<{ order_id: string; reserved_until: string }> {
  const userSessionToken = await readTelegramUserSessionToken();
  console.log("tg_create_order payload", {
    post_ids_count: Array.isArray(payload.post_ids) ? payload.post_ids.length : 0,
    delivery_type: payload.delivery_type,
    has_city: Boolean(payload.city),
    has_cdek_pvz_code: Boolean(payload.cdek_pvz_code),
    has_cdek_pvz_address: Boolean(payload.cdek_pvz_address),
    has_address_preset_id: Boolean(payload.address_preset_id),
    has_street: Boolean(payload.street),
    has_house: Boolean(payload.house),
    has_entrance: Boolean(payload.entrance),
    has_apartment: Boolean(payload.apartment),
    has_floor: Boolean(payload.floor),
    delivery_base_fee_rub: payload.delivery_base_fee_rub,
    delivery_markup_rub: payload.delivery_markup_rub,
    delivery_total_fee_rub: payload.delivery_total_fee_rub,
    has_promo_code: Boolean(String(payload.promo_code ?? "").trim()),
  });
  // Критично: RPC ожидает имена аргументов p_* (см. сигнатуру функции в Postgres).
  // Если отправить обычные имена полей, заказ не создастся.
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    order_id?: string;
    reserved_until?: string;
  }>("tg_create_order_secure", {
    body: {
      post_ids: payload.post_ids,
      delivery_type: payload.delivery_type,
      fio: payload.fio,
      phone: payload.phone,
      city: payload.city ?? null,
      cdek_pvz_code: payload.cdek_pvz_code ?? null,
      cdek_pvz_address: payload.cdek_pvz_address ?? null,
      receiver_city_code: payload.receiver_city_code ?? null,
      delivery_point: payload.delivery_point ?? null,
      packaging_type: payload.packaging_type ?? "standard",
      address_preset_id: payload.address_preset_id ?? null,
      street: payload.street ?? null,
      house: payload.house ?? null,
      entrance: payload.entrance ?? null,
      apartment: payload.apartment ?? null,
      floor: payload.floor ?? null,
      delivery_base_fee_rub: payload.delivery_base_fee_rub,
      delivery_markup_rub: payload.delivery_markup_rub,
      delivery_total_fee_rub: payload.delivery_total_fee_rub,
      promo_code: String(payload.promo_code ?? "").trim() || null,
    },
    headers: buildTelegramUserSessionHeaders(userSessionToken),
  });

  if (error) {
    console.error("tg_create_order error", {
      message: error.message ?? null,
      code: (error as { code?: string | null }).code ?? null,
    });
    const message = error.message ?? "";
    if (message.includes("NOT_AVAILABLE")) throw new Error("NOT_AVAILABLE");
    if (message.includes("CHECKOUT_RECIPIENT_REQUIRED")) throw new Error("CHECKOUT_RECIPIENT_REQUIRED");
    if (message.includes("CHECKOUT_RECEIVER_CITY_CODE_REQUIRED")) throw new Error("CHECKOUT_RECEIVER_CITY_CODE_REQUIRED");
    if (message.includes("CHECKOUT_DELIVERY_POINT_REQUIRED")) throw new Error("CHECKOUT_DELIVERY_POINT_REQUIRED");
    if (message.includes("CHECKOUT_POST_PACKAGING_PRESET_REQUIRED")) throw new Error("CHECKOUT_POST_PACKAGING_PRESET_REQUIRED");
    if (message.includes("CHECKOUT_POST_ORIGIN_PROFILE_REQUIRED")) throw new Error("CHECKOUT_POST_ORIGIN_PROFILE_REQUIRED");
    if (message.includes("CHECKOUT_PACKAGE_DIMENSIONS_REQUIRED")) throw new Error("CHECKOUT_PACKAGE_DIMENSIONS_REQUIRED");
    if (message.includes("CHECKOUT_DELIVERY_QUOTE_REQUIRED")) throw new Error("CHECKOUT_DELIVERY_QUOTE_REQUIRED");
    if (message.includes("CHECKOUT_DELIVERY_FEE_INVALID")) throw new Error("CHECKOUT_DELIVERY_FEE_INVALID");
    if (message.includes("CHECKOUT_DELIVERY_MARKUP_INVALID")) throw new Error("CHECKOUT_DELIVERY_MARKUP_INVALID");
    if (message.includes("CHECKOUT_DELIVERY_TOTAL_MISMATCH")) throw new Error("CHECKOUT_DELIVERY_TOTAL_MISMATCH");
    if (message.includes("PROMO_NOT_FOUND")) throw new Error("PROMO_NOT_FOUND");
    if (message.includes("PROMO_DISABLED")) throw new Error("PROMO_DISABLED");
    if (message.includes("PROMO_NOT_STARTED")) throw new Error("PROMO_NOT_STARTED");
    if (message.includes("PROMO_EXHAUSTED")) throw new Error("PROMO_EXHAUSTED");
    if (message.includes("PROMO_EXPIRED")) throw new Error("PROMO_EXPIRED");
    if (message.includes("PROMO_ALREADY_USED_BY_USER")) throw new Error("PROMO_ALREADY_USED_BY_USER");
    if (message.includes("PROMO_NOT_AVAILABLE_FOR_USER")) throw new Error("PROMO_NOT_AVAILABLE_FOR_USER");
    if (message.includes("PROMO_POST_NOT_AVAILABLE")) throw new Error("PROMO_POST_NOT_AVAILABLE");
    if (message.includes("PROMO_POST_NOT_PUBLISHED")) throw new Error("PROMO_POST_NOT_PUBLISHED");
    if (message.includes("PROMO_SUBTOTAL_MISMATCH")) throw new Error("PROMO_SUBTOTAL_MISMATCH");
    if (message.includes("LOYALTY_LEVEL1_ALREADY_USED")) throw new Error("LOYALTY_LEVEL1_ALREADY_USED");
    if (message.toLowerCase().includes("row-level security") || message.toLowerCase().includes("permission")) {
      throw new Error("PERMISSION_DENIED");
    }
    throw new Error(message || "CREATE_ORDER_FAILED");
  }

  if (data?.ok === false) {
    const message = String(data.error ?? "CREATE_ORDER_FAILED");
    if (message.includes("NOT_AVAILABLE")) throw new Error("NOT_AVAILABLE");
    if (message.includes("CHECKOUT_RECIPIENT_REQUIRED")) throw new Error("CHECKOUT_RECIPIENT_REQUIRED");
    if (message.includes("CHECKOUT_RECEIVER_CITY_CODE_REQUIRED")) throw new Error("CHECKOUT_RECEIVER_CITY_CODE_REQUIRED");
    if (message.includes("CHECKOUT_DELIVERY_POINT_REQUIRED")) throw new Error("CHECKOUT_DELIVERY_POINT_REQUIRED");
    if (message.includes("CHECKOUT_POST_PACKAGING_PRESET_REQUIRED")) throw new Error("CHECKOUT_POST_PACKAGING_PRESET_REQUIRED");
    if (message.includes("CHECKOUT_POST_ORIGIN_PROFILE_REQUIRED")) throw new Error("CHECKOUT_POST_ORIGIN_PROFILE_REQUIRED");
    if (message.includes("CHECKOUT_PACKAGE_DIMENSIONS_REQUIRED")) throw new Error("CHECKOUT_PACKAGE_DIMENSIONS_REQUIRED");
    if (message.includes("CHECKOUT_DELIVERY_QUOTE_REQUIRED")) throw new Error("CHECKOUT_DELIVERY_QUOTE_REQUIRED");
    if (message.includes("CHECKOUT_DELIVERY_FEE_INVALID")) throw new Error("CHECKOUT_DELIVERY_FEE_INVALID");
    if (message.includes("CHECKOUT_DELIVERY_MARKUP_INVALID")) throw new Error("CHECKOUT_DELIVERY_MARKUP_INVALID");
    if (message.includes("CHECKOUT_DELIVERY_TOTAL_MISMATCH")) throw new Error("CHECKOUT_DELIVERY_TOTAL_MISMATCH");
    if (message.includes("PROMO_NOT_FOUND")) throw new Error("PROMO_NOT_FOUND");
    if (message.includes("PROMO_DISABLED")) throw new Error("PROMO_DISABLED");
    if (message.includes("PROMO_NOT_STARTED")) throw new Error("PROMO_NOT_STARTED");
    if (message.includes("PROMO_EXHAUSTED")) throw new Error("PROMO_EXHAUSTED");
    if (message.includes("PROMO_EXPIRED")) throw new Error("PROMO_EXPIRED");
    if (message.includes("PROMO_ALREADY_USED_BY_USER")) throw new Error("PROMO_ALREADY_USED_BY_USER");
    if (message.includes("PROMO_NOT_AVAILABLE_FOR_USER")) throw new Error("PROMO_NOT_AVAILABLE_FOR_USER");
    if (message.includes("PROMO_POST_NOT_AVAILABLE")) throw new Error("PROMO_POST_NOT_AVAILABLE");
    if (message.includes("PROMO_POST_NOT_PUBLISHED")) throw new Error("PROMO_POST_NOT_PUBLISHED");
    if (message.includes("PROMO_SUBTOTAL_MISMATCH")) throw new Error("PROMO_SUBTOTAL_MISMATCH");
    if (message.includes("LOYALTY_LEVEL1_ALREADY_USED")) throw new Error("LOYALTY_LEVEL1_ALREADY_USED");
    throw new Error(message || "CREATE_ORDER_FAILED");
  }

  const row = data;
  console.log("tg_create_order response", {
    order_id: row?.order_id ?? null,
    has_reserved_until: Boolean(row?.reserved_until),
  });
  if (!row?.order_id || !row?.reserved_until) {
    throw new Error("CREATE_ORDER_FAILED");
  }

  return { order_id: String(row.order_id), reserved_until: String(row.reserved_until) };
}

export async function listOrderItems(orderId: string): Promise<TgOrderItem[]> {
  const { data, error } = await supabase
    .from("tg_order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("position_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as TgOrderItem[]) ?? [];
}

export async function listOrderItemsByOrderIds(orderIds: string[]): Promise<TgOrderItem[]> {
  const normalized = [...new Set(orderIds.map((value) => String(value ?? "").trim()).filter(Boolean))];
  if (!normalized.length) return [];
  const { data, error } = await supabase
    .from("tg_order_items")
    .select("*")
    .in("order_id", normalized)
    .order("position_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as TgOrderItem[]) ?? [];
}

export async function listOrderShipments(orderId: string): Promise<TgOrderShipment[]> {
  const userSessionToken = await readTelegramUserSessionToken();
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    mode: "user_by_order_id";
    shipments: TgOrderShipment[];
  }>("tg_order_shipments_read", {
    body: {
      mode: "user_by_order_id",
      order_id: orderId,
    },
    headers: buildTelegramUserSessionHeaders(userSessionToken),
  });
  if (error) throw error;
  if (!data?.ok || !Array.isArray(data.shipments)) throw new Error("SHIPMENTS_LOAD_FAILED");
  return data.shipments;
}

export async function listOrderShipmentsByOrderIds(
  orderIds: string[],
  actor: OrdersActorContext = "user",
): Promise<TgOrderShipment[]> {
  const normalized = [...new Set(orderIds.map((value) => String(value ?? "").trim()).filter(Boolean))];
  if (!normalized.length) return [];

  const adminToken = actor === "admin" ? readAdminToken() : "";
  const useAdminFlow = actor === "admin" && Boolean(adminToken);
  const requestBody = useAdminFlow
    ? { mode: "admin_by_order_ids" as const, order_ids: normalized }
    : { mode: "user_by_order_ids" as const, order_ids: normalized };

  const userSessionToken = useAdminFlow ? "" : await readTelegramUserSessionToken();

  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    mode: "user_by_order_ids" | "admin_by_order_ids";
    shipments: TgOrderShipment[];
  }>("tg_order_shipments_read", {
    body: requestBody,
    headers: useAdminFlow
      ? buildAdminSessionHeaders(adminToken)
      : buildTelegramUserSessionHeaders(userSessionToken),
  });
  if (error) throw error;
  if (!data?.ok || !Array.isArray(data.shipments)) throw new Error("SHIPMENTS_LOAD_FAILED");
  return data.shipments;
}

export async function calculateDeliveryQuote(params: {
  post_ids: string[];
  receiver_city_code: string;
  delivery_point: string;
}): Promise<DeliveryQuoteResult> {
  const { data, error } = await supabase.functions.invoke<DeliveryQuoteResult>("tg_calculate_delivery_quote", {
    body: {
      post_ids: params.post_ids,
      receiver_city_code: params.receiver_city_code,
      delivery_point: params.delivery_point,
    },
  });

  if (error) {
    throw error;
  }
  if (!data?.ok) {
    throw new Error("DELIVERY_QUOTE_FAILED");
  }
  return data;
}

export async function getOrder(orderId: string): Promise<TgOrder | null> {
  const userSessionToken = await readTelegramUserSessionToken();
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    mode: "user_one";
    order: TgOrder | null;
  }>("tg_orders_read", {
    body: {
      mode: "user_one",
      order_id: orderId,
    },
    headers: buildTelegramUserSessionHeaders(userSessionToken),
  });
  if (error) throw error;
  if (!data?.ok) throw new Error("ORDER_LOAD_FAILED");
  return data.order ?? null;
}

export function saveCheckoutPromoSnapshot(snapshot: PromoPreviewSnapshot | null) {
  try {
    if (!snapshot || !snapshot.promo_code) {
      window.localStorage.removeItem(TG_CHECKOUT_PROMO_KEY);
      return;
    }
    window.localStorage.setItem(TG_CHECKOUT_PROMO_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore
  }
}

export function readCheckoutPromoSnapshot(): PromoPreviewSnapshot | null {
  try {
    const raw = window.localStorage.getItem(TG_CHECKOUT_PROMO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PromoPreviewSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.promo_code) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCheckoutPromoSnapshot() {
  try {
    window.localStorage.removeItem(TG_CHECKOUT_PROMO_KEY);
  } catch {
    // ignore
  }
}

export async function previewCheckoutPricing(input: {
  post_ids: string[];
  promo_code?: string | null;
  delivery_total_fee_rub?: number;
}): Promise<PromoPreviewSnapshot> {
  const userSessionToken = await readTelegramUserSessionToken();
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    promo?: PromoPreviewSnapshot;
  }>("tg_promo_preview", {
    body: {
      post_ids: input.post_ids,
      promo_code: input.promo_code ?? null,
      delivery_total_fee_rub: Math.max(0, Math.round(Number(input.delivery_total_fee_rub ?? 0))),
    },
    headers: buildTelegramUserSessionHeaders(userSessionToken),
  });

  if (error) throw error;
  if (!data?.ok || !data.promo) {
    throw new Error(String(data?.error ?? "PROMO_PREVIEW_FAILED"));
  }
  return data.promo;
}

export async function previewPromo(input: {
  post_ids: string[];
  promo_code: string;
  delivery_total_fee_rub?: number;
}): Promise<PromoPreviewSnapshot> {
  return previewCheckoutPricing(input);
}

export async function getOrderPaymentContext(orderId: string): Promise<TgOrderPaymentContext> {
  const userSessionToken = await readTelegramUserSessionToken();
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    mode: "user_one";
    order: TgOrder | null;
    order_items?: TgOrderOriginItem[];
  }>("tg_orders_read", {
    body: {
      mode: "user_one",
      order_id: orderId,
    },
    headers: buildTelegramUserSessionHeaders(userSessionToken),
  });

  if (error) throw error;
  if (!data?.ok) throw new Error("ORDER_LOAD_FAILED");

  const orderItems = Array.isArray(data.order_items)
    ? data.order_items
        .map((row) => ({
          post_id: String(row.post_id ?? "").trim(),
          price_rub: Number(row.price_rub ?? 0),
          origin_profile: (row.origin_profile === "YAN" ? "YAN" : "ODN") as ShippingOriginProfile,
          position_index: row.position_index ?? null,
        }))
        .filter((row) => row.post_id)
    : [];

  return { order: data.order ?? null, orderItems };
}

export async function getOrderById(orderId: string): Promise<TgOrder | null> {
  return getOrder(orderId);
}

export async function listOrdersByUser(): Promise<TgOrder[]> {
  const userSessionToken = await readTelegramUserSessionToken();
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    mode: "user_list";
    orders: TgOrder[];
  }>("tg_orders_read", {
    body: {
      mode: "user_list",
    },
    headers: buildTelegramUserSessionHeaders(userSessionToken),
  });
  if (error) throw error;
  if (!data?.ok || !Array.isArray(data.orders)) throw new Error("ORDERS_LOAD_FAILED");
  return data.orders;
}

export async function getOrderWithTimeline(orderId: string): Promise<TgOrderWithTimeline> {
  const userSessionToken = await readTelegramUserSessionToken();
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    mode: "user_by_order_id" | "admin_by_order_id";
    order: TgOrder | null;
    timeline: TgOrderTimelineEvent[];
  }>("tg_order_with_timeline_read", {
    body: {
      mode: "user_by_order_id",
      order_id: orderId,
    },
    headers: buildTelegramUserSessionHeaders(userSessionToken),
  });
  if (error) throw error;
  if (!data?.ok || !data.order) {
    throw new Error("ORDER_TIMELINE_NOT_FOUND");
  }

  return {
    order: data.order,
    timeline: Array.isArray(data.timeline) ? data.timeline : [],
  };
}

export async function submitPaymentProof(orderId: string, proofKey: string): Promise<void> {
  const userSessionToken = await readTelegramUserSessionToken();
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    "tg_submit_payment_proof",
    {
      body: {
        order_id: orderId,
        payment_proof_key: proofKey,
      },
      headers: buildTelegramUserSessionHeaders(userSessionToken),
    },
  );
  if (error) throw error;
  if (data?.ok) return;
  const code = String(data?.error ?? "");
  if (code === "ORDER_RESERVATION_EXPIRED") throw new Error("ORDER_RESERVATION_EXPIRED");
  if (code === "ORDER_STATUS_NOT_SUBMITTABLE") throw new Error("ORDER_STATUS_NOT_SUBMITTABLE");
  if (code === "FORBIDDEN") throw new Error("ORDER_NOT_FOUND_OR_FORBIDDEN");
  throw new Error("SUBMIT_PAYMENT_PROOF_FAILED");
}

export async function cancelPendingOrder(orderId: string): Promise<void> {
  const userSessionToken = await readTelegramUserSessionToken();
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    "tg_cancel_order",
    {
      body: { order_id: orderId },
      headers: buildTelegramUserSessionHeaders(userSessionToken),
    },
  );
  if (error) throw error;
  if (data?.ok) return;
  const code = String(data?.error ?? "");
  if (code === "ORDER_NOT_FOUND") throw new Error("ORDER_NOT_FOUND");
  if (code === "FORBIDDEN") throw new Error("ORDER_ACCESS_DENIED");
  if (code === "ORDER_ALREADY_IN_PROCESS") throw new Error("ORDER_ALREADY_IN_PROCESS");
  if (code === "ORDER_STATUS_NOT_CANCELLABLE") throw new Error("ORDER_STATUS_NOT_CANCELLABLE");
  throw new Error("CANCEL_ORDER_FAILED");
}

export async function applyCheckoutOptionsToOrder(
  orderId: string,
  tgUserId: number,
  packagingType: PackagingType,
  addressPresetId: string | null,
): Promise<void> {
  const safeTgUserId = ensureTgUserId(tgUserId);
  console.warn("Legacy checkout options flow is disabled", {
    orderId,
    tgUserId: safeTgUserId,
    packagingType,
    addressPresetId,
  });
  throw new Error("LEGACY_CHECKOUT_OPTIONS_DISABLED");
}

export async function listOrdersByStatuses(statuses: TgOrderStatus[]): Promise<TgOrder[]> {
  const adminToken = readAdminToken();
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    mode: "admin_by_statuses";
    orders: TgOrder[];
  }>("tg_orders_read", {
    body: {
      mode: "admin_by_statuses",
      statuses,
    },
    headers: buildAdminSessionHeaders(adminToken),
  });
  if (error) throw error;
  if (!data?.ok || !Array.isArray(data.orders)) throw new Error("ORDERS_LOAD_FAILED");
  return data.orders;
}

export type ConfirmOrderPaymentResult = {
  ok: boolean;
  existing: boolean;
  payment_already_confirmed: boolean;
  recorded_to_prodazhi: boolean;
  prodazhi_id: number | null;
  previous_status: TgOrderStatus;
  current_status: TgOrderStatus;
  post_id: string;
  nalichie_id: number | null;
  stock_deduction_status: "applied" | "existing";
  previous_post_sale_status: string | null;
  current_post_sale_status: string | null;
  previous_nalichie_status: string | null;
  current_nalichie_status: string | null;
};

export type FinalizeOrderShipmentResult =
  | {
      ok: true;
      payment: ConfirmOrderPaymentResult;
      shipment: {
        ok: true;
        status: "created" | "existing" | "in_progress" | "skipped";
        reason?: "order_not_paid" | "delivery_type_not_supported";
        order_id: string;
        origin_profile: ShippingOriginProfile | null;
        cdek_uuid: string | null;
        cdek_track_number: string | null;
        cdek_status: string | null;
        cdek_tariff_code: number | null;
      };
    }
  | {
      ok: false;
      error: "SHIPMENT_CREATE_FAILED_AFTER_PAYMENT_CONFIRMED";
      message: string;
      payment: ConfirmOrderPaymentResult;
      shipment: {
        ok: false;
        status: "failed";
        error: string;
        details: unknown;
      };
    };

export type RecoverStaleShipmentLockResult = {
  ok: true;
  status: "recovered" | "not_stale" | "already_created" | "not_locked" | "not_found";
  order_id: string;
  cdek_uuid: string | null;
  shipment_create_started_at: string | null;
};

export type RejectOrderPaymentResult = {
  ok: true;
  status: "rejected" | "already_rejected";
  order_id: string;
  previous_status: TgOrderStatus;
  current_status: "rejected";
};

export type SyncShipmentStatusResult = {
  ok: true;
  status: "updated" | "unchanged" | "skipped";
  reason?: "shipment_not_created";
  order_id: string;
  origin_profile: ShippingOriginProfile | null;
  cdek_uuid: string | null;
  cdek_track_number: string | null;
  cdek_status: string | null;
};

export type SyncActiveShipmentsItemResult = {
  order_id: string;
  cdek_uuid: string | null;
  status: "updated" | "unchanged" | "skipped" | "failed";
  reason?: "final_status";
  cdek_track_number?: string | null;
  cdek_status?: string | null;
  error?: string;
};

export type SyncActiveShipmentsBatchResult = {
  ok: true;
  limit: number;
  processed: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  items: SyncActiveShipmentsItemResult[];
};

export type AdminAnalyticsRange = "today" | "7d" | "30d" | "all";

export type AdminAnalyticsListItem = {
  order_id: string;
  status: TgOrderStatus | string | null;
  created_at: string | null;
  updated_at: string | null;
  payment_confirmed_at: string | null;
  fio: string | null;
  price_rub: number | null;
  delivery_type: DeliveryType | string | null;
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

function readAdminToken() {
  try {
    return (window.localStorage.getItem("tg_admin_session_token") ?? "").trim();
  } catch {
    return "";
  }
}

async function readTelegramUserSessionToken() {
  return ensureTelegramUserSessionToken();
}

function buildAdminSessionHeaders(adminToken: string): Record<string, string> | undefined {
  if (!adminToken) return undefined;
  return {
    "x-admin-token": adminToken,
  };
}

function buildTelegramUserSessionHeaders(userSessionToken: string): Record<string, string> {
  if (!userSessionToken) {
    throw new Error(TG_IDENTITY_REQUIRED_ERROR);
  }
  return {
    "x-tg-user-session": userSessionToken,
  };
}

export async function confirmOrderAndFinalizeShipment(orderId: string): Promise<FinalizeOrderShipmentResult> {
  const adminToken = readAdminToken();
  const { data, error } = await supabase.functions.invoke<FinalizeOrderShipmentResult>(
    "tg_confirm_paid_and_finalize_order",
    {
      body: { order_id: orderId },
      headers: buildAdminSessionHeaders(adminToken),
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("FINALIZE_ORDER_FAILED");
  }

  return data;
}

export async function recoverStaleShipmentLock(orderId: string): Promise<RecoverStaleShipmentLockResult> {
  const adminToken = readAdminToken();
  const { data, error } = await supabase.functions.invoke<RecoverStaleShipmentLockResult>(
    "tg_recover_stale_shipment_lock",
    {
      body: { order_id: orderId },
      headers: buildAdminSessionHeaders(adminToken),
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("RECOVER_STALE_SHIPMENT_LOCK_FAILED");
  }

  return data;
}

export async function syncShipmentStatus(orderId: string): Promise<SyncShipmentStatusResult> {
  const adminToken = readAdminToken();
  const { data, error } = await supabase.functions.invoke<SyncShipmentStatusResult>(
    "tg_sync_shipment_status",
    {
      body: { order_id: orderId },
      headers: buildAdminSessionHeaders(adminToken),
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("SYNC_SHIPMENT_STATUS_FAILED");
  }

  return data;
}

export async function syncActiveShipments(limit = 50, maxTotal = 500): Promise<SyncActiveShipmentsBatchResult> {
  const adminToken = readAdminToken();
  const { data, error } = await supabase.functions.invoke<SyncActiveShipmentsBatchResult>(
    "tg_sync_active_shipments",
    {
      body: { limit, max_total: maxTotal },
      headers: buildAdminSessionHeaders(adminToken),
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("SYNC_ACTIVE_SHIPMENTS_FAILED");
  }

  return data;
}

export async function getAdminAnalytics(range: AdminAnalyticsRange): Promise<AdminAnalyticsSnapshot> {
  const adminToken = readAdminToken();
  const { data, error } = await supabase.functions.invoke<AdminAnalyticsSnapshot>(
    "tg_admin_analytics",
    {
      body: { range },
      headers: buildAdminSessionHeaders(adminToken),
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("ADMIN_ANALYTICS_FAILED");
  }

  return data;
}

export async function getShipmentStatusHistory(orderId: string): Promise<ShipmentStatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from("tg_shipment_status_history")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as ShipmentStatusHistoryEntry[]) ?? [];
}

export async function listShipmentStatusHistoryByOrderIds(orderIds: string[]): Promise<ShipmentStatusHistoryEntry[]> {
  const normalized = [...new Set(orderIds.map((value) => String(value ?? "").trim()).filter(Boolean))];
  if (!normalized.length) return [];

  const { data, error } = await supabase
    .from("tg_shipment_status_history")
    .select("*")
    .in("order_id", normalized)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as ShipmentStatusHistoryEntry[]) ?? [];
}

export async function getAdminOrderEvents(orderId: string): Promise<AdminOrderEvent[]> {
  const adminToken = readAdminToken();
  const { data, error } = await supabase.functions.invoke<{
    ok: boolean;
    order_id: string;
    events: AdminOrderEvent[];
  }>("tg_admin_order_events", {
    body: { order_id: orderId },
    headers: buildAdminSessionHeaders(adminToken),
  });

  if (error) {
    throw error;
  }

  if (!data?.ok || !Array.isArray(data.events)) {
    throw new Error("ADMIN_ORDER_EVENTS_FAILED");
  }

  return data.events;
}

export async function rejectOrderPayment(orderId: string, reason = ""): Promise<void> {
  const adminToken = readAdminToken();
  const { data, error } = await supabase.functions.invoke<RejectOrderPaymentResult>(
    "tg_reject_order_payment",
    {
      body: { order_id: orderId, reason },
      headers: buildAdminSessionHeaders(adminToken),
    },
  );

  if (error) {
    throw error;
  }

  if (!data?.ok) {
    throw new Error("REJECT_ORDER_PAYMENT_FAILED");
  }
}
