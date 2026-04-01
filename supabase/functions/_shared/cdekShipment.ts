const PACKAGE_PRESET_DIMENSIONS = {
  A4: { weight: 400, length: 15, width: 10, height: 4 },
  A3: { weight: 600, length: 35, width: 42, height: 4 },
  A2: { weight: 900, length: 49, width: 58, height: 7 },
} as const;

type OriginProfile = "ODN" | "YAN";
type PackagingPreset = "A2" | "A3" | "A4";
type OrderStatus =
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
type ShipmentSuccessStatus = "created" | "existing" | "in_progress";
type ShipmentSkippedReason = "order_not_paid" | "delivery_type_not_supported";
type ShipmentRecoveryStatus = "recovered" | "not_stale" | "already_created" | "not_locked" | "not_found";
type ActiveShipmentSyncItemStatus = "updated" | "unchanged" | "skipped" | "failed";

export const SHIPMENT_LOCK_STALE_MINUTES = 15;
export const ACTIVE_SHIPMENT_SYNC_LIMIT = 20;
export const TRACK_POLL_MAX_ATTEMPTS = 10;
export const TRACK_POLL_INTERVAL_MS = 1000;

export type ShipmentProcessResult = {
  ok: true;
  status: ShipmentSuccessStatus | "skipped";
  reason?: ShipmentSkippedReason;
  order_id: string;
  origin_profile: OriginProfile | null;
  cdek_uuid: string | null;
  cdek_track_number: string | null;
  cdek_status: string | null;
  cdek_tariff_code: number | null;
};

export type ShipmentLockRecoveryResult = {
  ok: true;
  status: ShipmentRecoveryStatus;
  order_id: string;
  cdek_uuid: string | null;
  shipment_create_started_at: string | null;
};

export type ShipmentStatusSyncResult = {
  ok: true;
  status: "updated" | "unchanged" | "skipped";
  reason?: "shipment_not_created";
  order_id: string;
  origin_profile: OriginProfile | null;
  cdek_uuid: string | null;
  cdek_track_number: string | null;
  cdek_status: string | null;
};

export type ShipmentWebhookResult = {
  ok: true;
  status: "updated" | "unchanged" | "ignored";
  reason?: "shipment_uuid_missing" | "shipment_not_matched" | "payload_not_supported";
  order_id: string | null;
  cdek_uuid: string | null;
  cdek_track_number: string | null;
  cdek_status: string | null;
};

export type ActiveShipmentSyncItemResult = {
  order_id: string;
  cdek_uuid: string | null;
  status: ActiveShipmentSyncItemStatus;
  reason?: "final_status";
  cdek_track_number?: string | null;
  cdek_status?: string | null;
  error?: string;
};

export type ActiveShipmentSyncBatchResult = {
  ok: true;
  limit: number;
  processed: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  items: ActiveShipmentSyncItemResult[];
};

type ShipmentStatusEventSource = "webhook" | "manual_sync" | "scheduled_sync";
type OrderStatusReconciliationSource = ShipmentStatusEventSource | "create_followup";

function isOrderStatus(value: unknown): value is OrderStatus {
  return value === "created" ||
    value === "awaiting_payment_proof" ||
    value === "payment_proof_submitted" ||
    value === "payment_confirmed" ||
    value === "paid" ||
    value === "ready_for_pickup" ||
    value === "completed" ||
    value === "rejected" ||
    value === "expired" ||
    value === "cancelled";
}

function logShipmentEvent(event: string, data: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      scope: "shipment",
      event,
      ...data,
    }),
  );
}

async function insertShipmentStatusHistory(
  supabase: any,
  params: {
    orderId: string;
    cdekUuid: string | null;
    cdekStatus: string | null;
    cdekTrackNumber: string | null;
    eventSource: ShipmentStatusEventSource;
  },
) {
  const { error } = await supabase.from("tg_shipment_status_history").insert({
    order_id: params.orderId,
    cdek_uuid: params.cdekUuid,
    cdek_status: params.cdekStatus,
    cdek_track_number: params.cdekTrackNumber,
    event_source: params.eventSource,
  });

  if (error) {
    throw new ShipmentProcessError("SHIPMENT_STATUS_HISTORY_SAVE_FAILED", 500, error.message);
  }

  logShipmentEvent("shipment_status_history_saved", {
    orderId: params.orderId,
    cdekUuid: params.cdekUuid,
    cdekStatus: params.cdekStatus,
    cdekTrackNumber: params.cdekTrackNumber,
    eventSource: params.eventSource,
  });
}

export class ShipmentProcessError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(code: string, status: number, details?: unknown) {
    super(code);
    this.name = "ShipmentProcessError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error ?? "UNKNOWN_ERROR");
}

function toSafeErrorDetails(error: unknown) {
  if (error instanceof ShipmentProcessError) {
    return {
      code: error.code,
      details: error.details ?? null,
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "UNKNOWN_ERROR",
    };
  }
  return { message: String(error ?? "UNKNOWN_ERROR") };
}

function toInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function isOriginProfile(value: unknown): value is OriginProfile {
  return value === "ODN" || value === "YAN";
}

function isPackagingPreset(value: unknown): value is PackagingPreset {
  return value === "A2" || value === "A3" || value === "A4";
}

function resolveCartPackaging(packagingPresets: PackagingPreset[]): PackagingPreset {
  if (!packagingPresets.length) {
    throw new ShipmentProcessError("PACKAGING_PRESET_REQUIRED", 409);
  }

  if (packagingPresets.length >= 3) {
    return "A2";
  }

  if (packagingPresets.length === 1) {
    return packagingPresets[0];
  }

  const first = packagingPresets[0];
  const second = packagingPresets[1];

  if (first === "A2" || second === "A2") return "A2";
  if (first === "A3" && second === "A3") return "A2";
  if ((first === "A4" && second === "A3") || (first === "A3" && second === "A4")) return "A2";
  return "A3";
}

function deriveOriginProfile(postType: string): OriginProfile {
  return postType === "consignment" ? "YAN" : "ODN";
}

function normalizeTrackData(statusPayload: Record<string, unknown> | null) {
  const entity = (statusPayload?.entity ?? statusPayload) as Record<string, unknown> | null;
  const statuses = Array.isArray(entity?.statuses) ? entity.statuses : [];
  const latestStatus = statuses.length ? statuses[statuses.length - 1] as Record<string, unknown> : null;
  const nestedStatus = entity?.status && typeof entity.status === "object"
    ? entity.status as Record<string, unknown>
    : null;

  const normalizeTrackValue = (value: unknown): string | null => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  };

  return {
    cdekNumber: normalizeTrackValue(entity?.cdek_number) ?? normalizeTrackValue(entity?.track),
    cdekStatus: typeof entity?.status === "string"
      ? entity.status
      : typeof nestedStatus?.code === "string"
        ? nestedStatus.code
        : typeof nestedStatus?.name === "string"
          ? nestedStatus.name
          : typeof latestStatus?.code === "string"
            ? latestStatus.code
            : typeof latestStatus?.name === "string"
              ? latestStatus.name
              : null,
  };
}

function getLatestRequestState(statusPayload: Record<string, unknown> | null): string | null {
  const entity = (statusPayload?.entity ?? statusPayload) as Record<string, unknown> | null;
  const requests = Array.isArray(entity?.requests) ? entity.requests : [];
  const latestRequest = requests.length
    ? requests[requests.length - 1] as Record<string, unknown>
    : null;

  const rawState = latestRequest?.state;
  if (typeof rawState !== "string") return null;
  const normalized = rawState.trim().toUpperCase();
  return normalized || null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isFinalShipmentStatus(status?: string | null) {
  const normalized = String(status ?? "").trim();
  return normalized === "DELIVERED" || normalized === "CANCELLED";
}

export function reconcileOrderStatusFromShipment(params: {
  currentOrderStatus?: string | null;
  shipmentStatus?: string | null;
}): OrderStatus | null {
  const currentOrderStatus = String(params.currentOrderStatus ?? "").trim();
  const shipmentStatus = String(params.shipmentStatus ?? "").trim();

  if (!isOrderStatus(currentOrderStatus)) return null;
  if (!shipmentStatus) return null;

  if (currentOrderStatus === "rejected" || currentOrderStatus === "expired" || currentOrderStatus === "cancelled") {
    return null;
  }

  if (shipmentStatus === "DELIVERED") {
    if (
      currentOrderStatus === "payment_confirmed" ||
      currentOrderStatus === "paid" ||
      currentOrderStatus === "ready_for_pickup"
    ) {
      return "completed";
    }
    return null;
  }

  if (shipmentStatus === "READY_FOR_PICKUP") {
    if (currentOrderStatus === "payment_confirmed" || currentOrderStatus === "paid") {
      return "ready_for_pickup";
    }
    return null;
  }

  return null;
}

async function applyOrderStatusReconciliation(
  supabase: any,
  params: {
    orderId: string;
    currentOrderStatus?: string | null;
    shipmentStatus?: string | null;
    source: OrderStatusReconciliationSource;
  },
) {
  const nextOrderStatus = reconcileOrderStatusFromShipment({
    currentOrderStatus: params.currentOrderStatus,
    shipmentStatus: params.shipmentStatus,
  });

  if (!nextOrderStatus) {
    logShipmentEvent("order_status_reconciliation_skipped", {
      orderId: params.orderId,
      previousOrderStatus: params.currentOrderStatus,
      shipmentStatus: params.shipmentStatus,
      nextOrderStatus: null,
      source: params.source,
      reason: "rule_not_applicable",
    });
    return {
      changed: false as const,
      nextOrderStatus: isOrderStatus(params.currentOrderStatus) ? params.currentOrderStatus : null,
    };
  }

  if (nextOrderStatus === params.currentOrderStatus) {
    logShipmentEvent("order_status_reconciliation_skipped", {
      orderId: params.orderId,
      previousOrderStatus: params.currentOrderStatus,
      shipmentStatus: params.shipmentStatus,
      nextOrderStatus,
      source: params.source,
      reason: "already_applied",
    });
    return {
      changed: false as const,
      nextOrderStatus: isOrderStatus(params.currentOrderStatus) ? params.currentOrderStatus : null,
    };
  }

  const { error } = await supabase
    .from("tg_orders")
    .update({
      status: nextOrderStatus,
    })
    .eq("id", params.orderId)
    .eq("status", params.currentOrderStatus);

  if (error) {
    throw new ShipmentProcessError("ORDER_STATUS_RECONCILIATION_FAILED", 500, error.message);
  }

  logShipmentEvent("order_status_reconciled", {
    orderId: params.orderId,
    previousOrderStatus: params.currentOrderStatus,
    shipmentStatus: params.shipmentStatus,
    nextOrderStatus,
    source: params.source,
  });

  return {
    changed: true as const,
    nextOrderStatus,
  };
}

function unwrapWebhookEntity(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;

  if (Array.isArray(payload)) {
    if (payload.length !== 1) return null;
    return unwrapWebhookEntity(payload[0]);
  }

  const root = payload as Record<string, unknown>;
  if (root.entity && typeof root.entity === "object" && !Array.isArray(root.entity)) {
    return root.entity as Record<string, unknown>;
  }
  if (root.order && typeof root.order === "object" && !Array.isArray(root.order)) {
    return root.order as Record<string, unknown>;
  }
  if (root.attributes && typeof root.attributes === "object" && !Array.isArray(root.attributes)) {
    return root.attributes as Record<string, unknown>;
  }

  return root;
}

function normalizeWebhookShipmentData(payload: unknown) {
  const entity = unwrapWebhookEntity(payload);
  if (!entity) {
    return {
      cdekUuid: null,
      cdekNumber: null,
      cdekStatus: null,
    };
  }

  const normalized = normalizeTrackData(entity);
  const cdekUuid =
    typeof entity.uuid === "string"
      ? entity.uuid
      : typeof entity.order_uuid === "string"
        ? entity.order_uuid
        : null;

  return {
    cdekUuid,
    cdekNumber: normalized.cdekNumber,
    cdekStatus: normalized.cdekStatus,
  };
}

function getOrderIdentity(row: Record<string, unknown>) {
  return {
    orderId: String(row.id),
    originProfile: isOriginProfile(row.origin_profile) ? row.origin_profile : null,
    cdekUuid: typeof row.cdek_uuid === "string" ? row.cdek_uuid : null,
    shipmentStatus: typeof row.cdek_status === "string" ? row.cdek_status : null,
  };
}

function buildCanonicalShipmentInput(row: Record<string, unknown>) {
  return {
    originProfile: row.origin_profile,
    packagingPreset: row.packaging_preset,
    receiverCityCode: String(row.receiver_city_code ?? "").trim(),
    deliveryPoint: String(row.delivery_point ?? "").trim(),
    tariffCode: Number(row.cdek_tariff_code ?? 0) || null,
    package: {
      weight: Number(row.package_weight ?? 0),
      length: Number(row.package_length ?? 0),
      width: Number(row.package_width ?? 0),
      height: Number(row.package_height ?? 0),
    },
  };
}

function buildShipmentSnapshotPresence(row: Record<string, unknown>) {
  const recipientName = String(row.fio ?? "").trim();
  const recipientPhone = String(row.phone ?? "").trim();
  const maskPhone = recipientPhone.length >= 4
    ? `${"*".repeat(Math.max(0, recipientPhone.length - 4))}${recipientPhone.slice(-4)}`
    : recipientPhone;

  return {
    originProfilePresent: isOriginProfile(row.origin_profile),
    originProfile: typeof row.origin_profile === "string" ? row.origin_profile : null,
    packagingPresetPresent: isPackagingPreset(row.packaging_preset),
    packagingPreset: typeof row.packaging_preset === "string" ? row.packaging_preset : null,
    recipientNamePresent: Boolean(String(row.fio ?? "").trim()),
    recipientPhonePresent: Boolean(String(row.phone ?? "").trim()),
    recipientName: recipientName || null,
    recipientPhoneMasked: maskPhone || null,
    receiverCityCodePresent: Boolean(String(row.receiver_city_code ?? "").trim()),
    receiverCityCode: String(row.receiver_city_code ?? "").trim() || null,
    deliveryPointPresent: Boolean(String(row.delivery_point ?? "").trim()),
    deliveryPoint: String(row.delivery_point ?? "").trim() || null,
    packageWeightPresent: Number(row.package_weight ?? 0) > 0,
    packageWeight: Number(row.package_weight ?? 0) || null,
    packageLengthPresent: Number(row.package_length ?? 0) > 0,
    packageLength: Number(row.package_length ?? 0) || null,
    packageWidthPresent: Number(row.package_width ?? 0) > 0,
    packageWidth: Number(row.package_width ?? 0) || null,
    packageHeightPresent: Number(row.package_height ?? 0) > 0,
    packageHeight: Number(row.package_height ?? 0) || null,
  };
}

function normalizeProxyFailureCode(upstreamError: unknown): string {
  const value = String(upstreamError ?? "").trim();
  if (!value) return "SHIPMENT_CREATE_FAILED";
  if (!/^[A-Z0-9_]+$/.test(value)) return "SHIPMENT_CREATE_FAILED";
  return value;
}

function validateShipmentSnapshot(row: Record<string, unknown>) {
  const snapshot = buildCanonicalShipmentInput(row);

  const recipientName = String(row.fio ?? "").trim();
  const recipientPhone = String(row.phone ?? "").trim();
  if (!recipientName || !recipientPhone) {
    throw new ShipmentProcessError("RECIPIENT_REQUIRED", 409);
  }

  if (!snapshot.receiverCityCode) {
    throw new ShipmentProcessError("RECEIVER_CITY_CODE_REQUIRED", 409);
  }
  if (!snapshot.deliveryPoint) {
    throw new ShipmentProcessError("DELIVERY_POINT_REQUIRED", 409);
  }

  return {
    originProfile: isOriginProfile(snapshot.originProfile) ? snapshot.originProfile : null,
    receiverCityCode: snapshot.receiverCityCode,
    deliveryPoint: snapshot.deliveryPoint,
    tariffCode: snapshot.tariffCode,
    recipientName,
    recipientPhone,
  };
}

function buildResultFromOrder(
  status: ShipmentSuccessStatus,
  row: Record<string, unknown>,
): ShipmentProcessResult {
  return {
    ok: true,
    status,
    order_id: String(row.id),
    origin_profile: isOriginProfile(row.origin_profile) ? row.origin_profile : null,
    cdek_uuid: typeof row.cdek_uuid === "string" ? row.cdek_uuid : null,
    cdek_track_number: typeof row.cdek_track_number === "string" ? row.cdek_track_number : null,
    cdek_status: typeof row.cdek_status === "string" ? row.cdek_status : null,
    cdek_tariff_code: Number(row.cdek_tariff_code ?? 0) || null,
  };
}

type OrderShipmentRow = {
  id: string;
  order_id: string;
  origin_profile: OriginProfile;
  cdek_uuid: string | null;
  cdek_track_number: string | null;
  cdek_status: string | null;
  cdek_tariff_code: number | null;
  created_at?: string | null;
};

async function listOrderShipments(
  supabase: any,
  orderId: string,
): Promise<OrderShipmentRow[]> {
  const { data, error } = await supabase
    .from("tg_order_shipments")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw new ShipmentProcessError("ORDER_SHIPMENTS_LOOKUP_FAILED", 500, error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ""),
    order_id: String(row.order_id ?? ""),
    origin_profile: isOriginProfile(row.origin_profile) ? row.origin_profile : "ODN",
    cdek_uuid: typeof row.cdek_uuid === "string" ? row.cdek_uuid : null,
    cdek_track_number: typeof row.cdek_track_number === "string" ? row.cdek_track_number : null,
    cdek_status: typeof row.cdek_status === "string" ? row.cdek_status : null,
    cdek_tariff_code: Number(row.cdek_tariff_code ?? 0) || null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
  }));
}

async function upsertOrderShipment(
  supabase: any,
  params: {
    orderId: string;
    originProfile: OriginProfile;
    cdekUuid: string | null;
    cdekTrackNumber: string | null;
    cdekStatus: string | null;
    cdekTariffCode: number | null;
  },
) {
  const { error } = await supabase
    .from("tg_order_shipments")
    .upsert({
      order_id: params.orderId,
      origin_profile: params.originProfile,
      cdek_uuid: params.cdekUuid,
      cdek_track_number: params.cdekTrackNumber,
      cdek_status: params.cdekStatus,
      cdek_tariff_code: params.cdekTariffCode,
    }, {
      onConflict: "order_id,origin_profile",
    });
  if (error) throw new ShipmentProcessError("ORDER_SHIPMENTS_SAVE_FAILED", 500, error.message);
}

async function releaseShipmentCreateLock(supabase: any, orderId: string) {
  const { error } = await supabase
    .from("tg_orders")
    .update({
      shipment_create_in_progress: false,
      shipment_create_started_at: null,
    })
    .eq("id", orderId)
    .eq("shipment_create_in_progress", true);

  if (error) {
    throw new ShipmentProcessError("SHIPMENT_LOCK_RELEASE_FAILED", 500, error.message);
  }

  logShipmentEvent("shipment_lock_released", { orderId });
}

function buildRecoveryResult(
  status: ShipmentRecoveryStatus,
  orderId: string,
  row: Record<string, unknown> | null,
): ShipmentLockRecoveryResult {
  return {
    ok: true,
    status,
    order_id: row ? String(row.id) : orderId,
    cdek_uuid: row && typeof row.cdek_uuid === "string" ? row.cdek_uuid : null,
    shipment_create_started_at:
      row && typeof row.shipment_create_started_at === "string" ? row.shipment_create_started_at : null,
  };
}

export async function recoverStaleShipmentCreateLock(
  supabase: any,
  orderId: string,
): Promise<ShipmentLockRecoveryResult> {
  const { data, error } = await supabase.rpc("tg_recover_stale_shipment_create", {
    p_order_id: orderId,
  });

  if (error) {
    throw new ShipmentProcessError("SHIPMENT_LOCK_RECOVERY_FAILED", 500, error.message);
  }

  const payload = (data ?? null) as { status?: string; order?: Record<string, unknown> } | null;
  const status = String(payload?.status ?? "");
  const row = (payload?.order ?? null) as Record<string, unknown> | null;

  if (
    status === "recovered" ||
    status === "not_stale" ||
    status === "already_created" ||
    status === "not_locked" ||
    status === "not_found"
  ) {
    logShipmentEvent("shipment_lock_recovery", {
      orderId,
      recoveryStatus: status,
      cdekUuid: row && typeof row.cdek_uuid === "string" ? row.cdek_uuid : null,
      startedAt: row && typeof row.shipment_create_started_at === "string" ? row.shipment_create_started_at : null,
    });
    return buildRecoveryResult(status, orderId, row);
  }

  throw new ShipmentProcessError("SHIPMENT_LOCK_RECOVERY_FAILED", 500, payload);
}

export async function createShipmentForOrder(
  supabase: any,
  cdekProxyBaseUrl: string,
  orderId: string,
): Promise<ShipmentProcessResult> {
  const { data: order, error: orderErr } = await supabase
    .from("tg_orders")
    .select(`
      id,
      tg_user_id,
      post_id,
      status,
      delivery_type,
      price_rub,
      fio,
      phone,
      city,
      cdek_pvz_code,
      cdek_pvz_address,
      packaging_preset,
      origin_profile,
      receiver_city_code,
      delivery_point,
      package_weight,
      package_length,
      package_width,
      package_height,
      cdek_uuid,
      cdek_track_number,
      cdek_status,
      cdek_tariff_code
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) throw new ShipmentProcessError("ORDER_LOOKUP_FAILED", 500, orderErr.message);
  if (!order) throw new ShipmentProcessError("ORDER_NOT_FOUND", 404);

  const row = order as Record<string, unknown>;
  logShipmentEvent("shipment_create_requested", {
    deliveryType: row.delivery_type ?? null,
    status: row.status ?? null,
    ...getOrderIdentity(row),
  });

  if (String(row.delivery_type ?? "pickup") !== "pickup") {
    return {
      ok: true,
      status: "skipped",
      reason: "delivery_type_not_supported",
      order_id: String(row.id),
      origin_profile: null,
      cdek_uuid: null,
      cdek_track_number: null,
      cdek_status: null,
      cdek_tariff_code: null,
    };
  }

  const existingShipments = await listOrderShipments(supabase, orderId);
  if (existingShipments.length && existingShipments.every((shipment) => shipment.cdek_uuid)) {
    const primary = existingShipments[0];
    return {
      ok: true,
      status: "existing",
      order_id: String(row.id),
      origin_profile: primary.origin_profile,
      cdek_uuid: primary.cdek_uuid,
      cdek_track_number: primary.cdek_track_number,
      cdek_status: primary.cdek_status,
      cdek_tariff_code: primary.cdek_tariff_code,
    };
  }

  if (typeof row.cdek_uuid === "string" && row.cdek_uuid.trim()) {
    return buildResultFromOrder("existing", row);
  }

  if (String(row.status ?? "") !== "paid") {
    return {
      ok: true,
      status: "skipped",
      reason: "order_not_paid",
      order_id: String(row.id),
      origin_profile: null,
      cdek_uuid: null,
      cdek_track_number: null,
      cdek_status: null,
      cdek_tariff_code: null,
    };
  }

  const { data: lockData, error: lockErr } = await supabase.rpc("tg_try_start_shipment_create", {
    p_order_id: orderId,
  });
  if (lockErr) throw new ShipmentProcessError("SHIPMENT_LOCK_FAILED", 500, lockErr.message);

  const lockPayload = (lockData ?? null) as { status?: string; order?: Record<string, unknown> } | null;
  const lockedRow = (lockPayload?.order ?? null) as Record<string, unknown> | null;
  const lockStatus = String(lockPayload?.status ?? "");
  logShipmentEvent("shipment_lock_result", {
    orderId,
    lockStatus,
    cdekUuid: lockedRow && typeof lockedRow.cdek_uuid === "string" ? lockedRow.cdek_uuid : null,
    startedAt: lockedRow && typeof lockedRow.shipment_create_started_at === "string" ? lockedRow.shipment_create_started_at : null,
  });

  if (lockStatus === "not_found") {
    throw new ShipmentProcessError("ORDER_NOT_FOUND", 404);
  }

  if (lockStatus === "existing" && lockedRow) {
    return buildResultFromOrder("existing", lockedRow);
  }

  if (lockStatus === "in_progress" && lockedRow) {
    return buildResultFromOrder("in_progress", lockedRow);
  }

  if (lockStatus !== "acquired" || !lockedRow) {
    throw new ShipmentProcessError("SHIPMENT_LOCK_FAILED", 409, lockPayload);
  }

  const lockedOrderRow = lockedRow;
  const proxyBase = cdekProxyBaseUrl.replace(/\/+$/, "");
  const createUrl = `${proxyBase}/api/shipping/create`;
  logShipmentEvent("shipment_proxy_target", {
    orderId,
    cdekProxyBaseUrlRaw: cdekProxyBaseUrl,
    proxyBase,
    createUrl,
    proxyHost: (() => {
      try {
        return new URL(createUrl).host;
      } catch {
        return null;
      }
    })(),
  });
  try {
    const snapshotPresence = buildShipmentSnapshotPresence(lockedOrderRow);
    logShipmentEvent("shipment_preflight_snapshot", {
      orderId,
      ...snapshotPresence,
    });

    let shippingInput: ReturnType<typeof validateShipmentSnapshot>;
    try {
      shippingInput = validateShipmentSnapshot(lockedOrderRow);
    } catch (validationError) {
      logShipmentEvent("shipment_preflight_validation_failed", {
        orderId,
        error: toErrorMessage(validationError),
        code: validationError instanceof ShipmentProcessError ? validationError.code : "VALIDATION_FAILED",
        ...snapshotPresence,
      });
      throw validationError;
    }

    const { data: orderItemsData, error: orderItemsErr } = await supabase
      .from("tg_order_items")
      .select("post_id, price_rub, tg_posts(origin_profile, post_type, packaging_preset)")
      .eq("order_id", orderId)
      .order("position_index", { ascending: true })
      .order("created_at", { ascending: true });

    if (orderItemsErr) {
      throw new ShipmentProcessError("ORDER_LOOKUP_FAILED", 500, orderItemsErr.message);
    }

    const orderItems = ((orderItemsData ?? []) as Array<Record<string, unknown>>)
      .map((row) => ({
        postId: String(row.post_id ?? "").trim(),
        priceRub: toInt(row.price_rub, 0),
        originProfile: (() => {
          const post = row.tg_posts && typeof row.tg_posts === "object"
            ? row.tg_posts as Record<string, unknown>
            : null;
          const profile = post ? post.origin_profile : null;
          if (isOriginProfile(profile)) return profile;
          const postType = String(post?.post_type ?? "warehouse");
          return deriveOriginProfile(postType);
        })(),
        packagingPreset: (() => {
          const post = row.tg_posts && typeof row.tg_posts === "object"
            ? row.tg_posts as Record<string, unknown>
            : null;
          const preset = post ? post.packaging_preset : null;
          return isPackagingPreset(preset) ? preset : null;
        })(),
      }))
      .filter((row) => Boolean(row.postId));

    if (!orderItems.length) {
      const salePrice = toInt(lockedOrderRow.price_rub, 0);
      if (salePrice <= 0) throw new ShipmentProcessError("SALE_PRICE_REQUIRED", 409);
      const fallbackPostId = String(lockedOrderRow.post_id ?? "").trim();
      if (!fallbackPostId) throw new ShipmentProcessError("ORDER_LOOKUP_FAILED", 500, "LEGACY_POST_ID_MISSING");
      const { data: fallbackPost, error: fallbackPostErr } = await supabase
        .from("tg_posts")
        .select("origin_profile, post_type, packaging_preset")
        .eq("id", fallbackPostId)
        .maybeSingle();
      if (fallbackPostErr) throw new ShipmentProcessError("ORDER_LOOKUP_FAILED", 500, fallbackPostErr.message);
      const fallbackPostRow = (fallbackPost ?? null) as Record<string, unknown> | null;
      const fallbackPreset = fallbackPostRow?.packaging_preset;
      if (!isPackagingPreset(fallbackPreset)) throw new ShipmentProcessError("PACKAGING_PRESET_REQUIRED", 409);
      orderItems.push({
        postId: fallbackPostId,
        priceRub: salePrice,
        originProfile: isOriginProfile(fallbackPostRow?.origin_profile)
          ? fallbackPostRow.origin_profile
          : deriveOriginProfile(String(fallbackPostRow?.post_type ?? "warehouse")),
        packagingPreset: fallbackPreset,
      });
    }

    if (orderItems.some((item) => item.priceRub <= 0)) {
      throw new ShipmentProcessError("SALE_PRICE_REQUIRED", 409);
    }

    const shipmentsByOrigin = new Map<OriginProfile, { items: typeof orderItems; presets: PackagingPreset[] }>();
    for (const item of orderItems) {
      if (!isPackagingPreset(item.packagingPreset)) {
        throw new ShipmentProcessError("PACKAGING_PRESET_REQUIRED", 409);
      }
      const current = shipmentsByOrigin.get(item.originProfile) ?? { items: [], presets: [] };
      current.items.push(item);
      current.presets.push(item.packagingPreset);
      shipmentsByOrigin.set(item.originProfile, current);
    }
    const originGroups = [...shipmentsByOrigin.entries()].map(([originProfile, group]) => ({
      originProfile,
      items: group.items,
      presets: group.presets,
    }));

    logShipmentEvent("shipment_preflight_validation_passed", {
      orderId,
      mixedOrigin: originGroups.length > 1,
      origins: originGroups.map((group) => group.originProfile),
      packagingPresetByOrigin: originGroups.map((group) => ({
        originProfile: group.originProfile,
        itemPresets: group.presets,
      })),
      receiverCityCodePresent: true,
      deliveryPointPresent: true,
      recipientNamePresent: true,
      recipientPhonePresent: true,
    });

    const isTariffUnavailable = (status: number, body: Record<string, unknown> | null) => {
      const error = typeof body?.error === "string" ? body.error : null;
      const errorCode = typeof body?.errorCode === "string" ? body.errorCode : null;
      return status === 422 || error === "TARIFF_NOT_AVAILABLE" || errorCode === "TARIFF_NOT_AVAILABLE";
    };

    const sendCreateAttempt = async (payload: Record<string, unknown>, tariffCode: number, event: string) => {
      const attemptPayload = {
        ...payload,
        tariffCode,
      };
      logShipmentEvent(event, {
        orderId,
        originProfile: payload.originProfile ?? null,
        deliveryPoint: shippingInput.deliveryPoint,
        tariffCode,
        packagingPreset: payload.packagingPreset ?? null,
      });

      const res = await fetch(createUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(attemptPayload),
      });
      const json = await res.json().catch(() => null) as Record<string, unknown> | null;
      return {
        res,
        json,
        tariffCode,
      };
    };

    console.log("CDEK PROXY REQUEST URL:", createUrl);
    const createdShipments: Array<{
      originProfile: OriginProfile;
      cdekUuid: string | null;
      cdekTrackNumber: string | null;
      cdekStatus: string | null;
      cdekTariffCode: number | null;
      packagingPreset: PackagingPreset;
      package: {
        weight: number;
        length: number;
        width: number;
        height: number;
      };
    }> = [];

    for (const group of originGroups) {
      const packagingPresetResolved = resolveCartPackaging(group.presets);
      const packageSnapshot = PACKAGE_PRESET_DIMENSIONS[packagingPresetResolved];
      const groupWeight = packageSnapshot.weight;
      const perItemWeight = Math.max(1, Math.round(groupWeight / Math.max(group.items.length, 1)));
      const payload = {
        originProfile: group.originProfile,
        packagingPreset: packagingPresetResolved,
        receiverCityCode: shippingInput.receiverCityCode,
        deliveryPoint: shippingInput.deliveryPoint,
        externalOrderId: `${String(lockedOrderRow.id)}-${group.originProfile}`,
        tariffCode: 136,
        recipient: {
          name: shippingInput.recipientName,
          phone: shippingInput.recipientPhone,
        },
        package: {
          weight: groupWeight,
          length: packageSnapshot.length,
          width: packageSnapshot.width,
          height: packageSnapshot.height,
        },
        items: group.items.map((item) => ({
          cost: item.priceRub,
          amount: 1,
          weight: perItemWeight,
          paymentValue: 0,
        })),
      };

      logShipmentEvent("shipment_create_upstream_start", {
        orderId,
        originProfile: group.originProfile,
        deliveryPoint: shippingInput.deliveryPoint,
        tariffCode: 136,
        packagingPreset: packagingPresetResolved,
      });

      const attempt136 = await sendCreateAttempt(payload, 136, "shipment_create_attempt_136");
      let createRes = attempt136.res;
      let createJson = attempt136.json;
      let finalTariffCode = attempt136.tariffCode;

      if ((!createRes.ok || !createJson?.ok) && isTariffUnavailable(createRes.status, createJson)) {
        const attempt234 = await sendCreateAttempt(payload, 234, "shipment_create_fallback_234");
        if (attempt234.res.ok && attempt234.json?.ok) {
          createRes = attempt234.res;
          createJson = attempt234.json;
          finalTariffCode = attempt234.tariffCode;
        } else {
          createRes = attempt136.res;
          createJson = attempt136.json;
          finalTariffCode = attempt136.tariffCode;
          logShipmentEvent("shipment_create_failed_both", {
            orderId,
            originProfile: group.originProfile,
            firstAttemptStatus: attempt136.res.status,
            secondAttemptStatus: attempt234.res.status,
          });
        }
      }

      if (!createRes.ok || !createJson?.ok) {
        const upstreamError =
          typeof createJson?.error === "string"
            ? createJson.error
            : typeof createJson?.message === "string"
              ? createJson.message
              : null;
        throw new ShipmentProcessError(
          normalizeProxyFailureCode(upstreamError),
          502,
          {
            originProfile: group.originProfile,
            status: createRes.status,
            response: createJson ?? null,
          },
        );
      }

      logShipmentEvent("shipment_create_proxy_response_raw", {
        orderId,
        originProfile: group.originProfile,
        status: createRes.status,
        ok: createRes.ok,
        response: createJson,
      });

      let cdekUuid = typeof createJson.uuid === "string" ? createJson.uuid : null;
      let cdekTrackNumber = typeof createJson.cdekNumber === "string"
        ? (createJson.cdekNumber.trim() || null)
        : (typeof createJson.cdekNumber === "number" && Number.isFinite(createJson.cdekNumber)
          ? String(createJson.cdekNumber)
          : null);
      let cdekStatus = typeof createJson.trackingStatus === "string" ? createJson.trackingStatus : null;
      const cdekTariffCode = Number(createJson.selectedTariffCode ?? finalTariffCode ?? 0) || null;

      if (cdekUuid) {
        const statusUrl =
          `${proxyBase}/api/shipping/status/${encodeURIComponent(cdekUuid)}?originProfile=${encodeURIComponent(group.originProfile)}`;
        logShipmentEvent("shipment_track_polling_started", {
          orderId,
          originProfile: group.originProfile,
          cdekUuid,
          maxAttempts: TRACK_POLL_MAX_ATTEMPTS,
          intervalMs: TRACK_POLL_INTERVAL_MS,
        });

        let pollSucceeded = false;
        let lastRequestState: string | null = null;

        for (let attempt = 1; attempt <= TRACK_POLL_MAX_ATTEMPTS; attempt += 1) {
          const statusRes = await fetch(statusUrl, { method: "GET" });
          const statusJson = await statusRes.json().catch(() => null) as Record<string, unknown> | null;
          logShipmentEvent("shipment_status_proxy_response_raw", {
            orderId,
            originProfile: group.originProfile,
            cdekUuid,
            attempt,
            status: statusRes.status,
            ok: statusRes.ok,
            response: statusJson,
          });

          if (statusRes.ok && statusJson?.ok) {
            const rawStatusPayload = (statusJson.status ?? null) as Record<string, unknown> | null;
            const normalized = normalizeTrackData(rawStatusPayload);
            const requestState = getLatestRequestState(rawStatusPayload);
            lastRequestState = requestState ?? lastRequestState;
            cdekTrackNumber = normalized.cdekNumber ?? cdekTrackNumber;
            cdekStatus = requestState ?? normalized.cdekStatus ?? cdekStatus;

            logShipmentEvent("shipment_track_poll_attempt", {
              orderId,
              originProfile: group.originProfile,
              cdekUuid,
              attempt,
              requestState,
              cdekStatus,
              cdekNumber: cdekTrackNumber,
            });

            if (requestState === "SUCCESSFUL" && cdekTrackNumber) {
              pollSucceeded = true;
              logShipmentEvent("shipment_track_polling_success", {
                orderId,
                originProfile: group.originProfile,
                cdekUuid,
                attempt,
                requestState,
                cdekStatus,
                cdekNumber: cdekTrackNumber,
              });
              break;
            }

            if (requestState === "INVALID" || requestState === "FAILED") {
              logShipmentEvent("shipment_track_polling_failed", {
                orderId,
                originProfile: group.originProfile,
                cdekUuid,
                attempt,
                requestState,
                cdekStatus,
                cdekNumber: cdekTrackNumber,
              });
              throw new ShipmentProcessError(
                "SHIPMENT_TRACK_POLL_FAILED",
                502,
                {
                  originProfile: group.originProfile,
                  requestState,
                  cdekStatus,
                  cdekNumber: cdekTrackNumber,
                },
              );
            }
          } else {
            logShipmentEvent("shipment_track_poll_attempt_network_error", {
              orderId,
              originProfile: group.originProfile,
              cdekUuid,
              attempt,
              status: statusRes.status,
              response: statusJson ?? null,
            });
          }

          if (attempt < TRACK_POLL_MAX_ATTEMPTS) {
            await sleep(TRACK_POLL_INTERVAL_MS);
          }
        }

        if (!pollSucceeded) {
          cdekStatus = cdekStatus ?? lastRequestState ?? "POLL_TIMEOUT";
          logShipmentEvent("shipment_track_polling_timeout", {
            orderId,
            originProfile: group.originProfile,
            cdekUuid,
            attempts: TRACK_POLL_MAX_ATTEMPTS,
            requestState: lastRequestState,
            cdekStatus,
            cdekNumber: cdekTrackNumber,
          });
        }
      }

      await upsertOrderShipment(supabase, {
        orderId,
        originProfile: group.originProfile,
        cdekUuid,
        cdekTrackNumber,
        cdekStatus,
        cdekTariffCode,
      });

      createdShipments.push({
        originProfile: group.originProfile,
        cdekUuid,
        cdekTrackNumber,
        cdekStatus,
        cdekTariffCode,
        packagingPreset: packagingPresetResolved,
        package: packageSnapshot,
      });
    }

    const primaryShipment = createdShipments[0] ?? null;

    const { error: updateErr } = await supabase
      .from("tg_orders")
      .update({
        origin_profile: primaryShipment?.originProfile ?? shippingInput.originProfile,
        receiver_city_code: shippingInput.receiverCityCode,
        delivery_point: shippingInput.deliveryPoint,
        packaging_preset: primaryShipment?.packagingPreset ?? null,
        package_weight: primaryShipment?.package.weight ?? null,
        package_length: primaryShipment?.package.length ?? null,
        package_width: primaryShipment?.package.width ?? null,
        package_height: primaryShipment?.package.height ?? null,
        cdek_uuid: primaryShipment?.cdekUuid ?? null,
        cdek_track_number: primaryShipment?.cdekTrackNumber ?? null,
        cdek_status: primaryShipment?.cdekStatus ?? null,
        cdek_tariff_code: primaryShipment?.cdekTariffCode ?? null,
        shipment_create_in_progress: false,
        shipment_create_started_at: null,
      })
      .eq("id", orderId)
      .eq("shipment_create_in_progress", true);

    if (updateErr) throw new ShipmentProcessError("SHIPMENT_SAVE_FAILED", 500, updateErr.message);

    await applyOrderStatusReconciliation(supabase, {
      orderId,
      currentOrderStatus: typeof row.status === "string" ? row.status : null,
      shipmentStatus: primaryShipment?.cdekStatus ?? null,
      source: "create_followup",
    });

    logShipmentEvent("shipment_create_completed", {
      orderId,
      originProfile: primaryShipment?.originProfile ?? shippingInput.originProfile,
      deliveryPoint: shippingInput.deliveryPoint,
      cdekUuid: primaryShipment?.cdekUuid ?? null,
      cdekStatus: primaryShipment?.cdekStatus ?? null,
      cdekTariffCode: primaryShipment?.cdekTariffCode ?? null,
      shipmentCount: createdShipments.length,
      outcome: "created",
    });

    return {
      ok: true,
      status: "created",
      order_id: orderId,
      origin_profile: primaryShipment?.originProfile ?? shippingInput.originProfile,
      cdek_uuid: primaryShipment?.cdekUuid ?? null,
      cdek_track_number: primaryShipment?.cdekTrackNumber ?? null,
      cdek_status: primaryShipment?.cdekStatus ?? null,
      cdek_tariff_code: primaryShipment?.cdekTariffCode ?? null,
    };
  } catch (error) {
    await releaseShipmentCreateLock(supabase, orderId);
    const normalizedError = error instanceof ShipmentProcessError
      ? error
      : new ShipmentProcessError("CDEK_PROXY_UNREACHABLE", 502, toSafeErrorDetails(error));
    logShipmentEvent("shipment_create_failed", {
      orderId,
      error: toErrorMessage(normalizedError),
      code: normalizedError.code,
      details: normalizedError.details ?? null,
    });
    throw normalizedError;
  }
}

export async function syncShipmentStatusForOrder(
  supabase: any,
  cdekProxyBaseUrl: string,
  orderId: string,
  eventSource: ShipmentStatusEventSource = "manual_sync",
): Promise<ShipmentStatusSyncResult> {
  const { data: order, error: orderErr } = await supabase
    .from("tg_orders")
    .select(`
      id,
      post_id,
      status,
      origin_profile,
      cdek_uuid,
      cdek_track_number,
      cdek_status
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) throw new ShipmentProcessError("ORDER_LOOKUP_FAILED", 500, orderErr.message);
  if (!order) throw new ShipmentProcessError("ORDER_NOT_FOUND", 404);

  const row = order as Record<string, unknown>;
  const orderShipments = await listOrderShipments(supabase, orderId);
  if (orderShipments.length) {
    let updatedCount = 0;
    let primaryShipment: OrderShipmentRow | null = null;

    for (const shipment of orderShipments) {
      if (!(typeof shipment.cdek_uuid === "string" && shipment.cdek_uuid.trim())) continue;
      const statusRes = await fetch(
        `${cdekProxyBaseUrl.replace(/\/+$/, "")}/api/shipping/status/${encodeURIComponent(shipment.cdek_uuid)}?originProfile=${encodeURIComponent(shipment.origin_profile)}`,
        { method: "GET" },
      );
      const statusJson = await statusRes.json().catch(() => null) as Record<string, unknown> | null;
      if (!statusRes.ok || !statusJson?.ok) {
        throw new ShipmentProcessError("SHIPMENT_STATUS_SYNC_FAILED", 502, statusJson ?? { status: statusRes.status });
      }
      const normalized = normalizeTrackData((statusJson.status ?? null) as Record<string, unknown> | null);
      const nextTrack = normalized.cdekNumber ?? shipment.cdek_track_number;
      const nextStatus = normalized.cdekStatus ?? shipment.cdek_status;
      const changed = nextTrack !== shipment.cdek_track_number || nextStatus !== shipment.cdek_status;

      if (changed) {
        updatedCount += 1;
        await upsertOrderShipment(supabase, {
          orderId,
          originProfile: shipment.origin_profile,
          cdekUuid: shipment.cdek_uuid,
          cdekTrackNumber: nextTrack,
          cdekStatus: nextStatus,
          cdekTariffCode: shipment.cdek_tariff_code,
        });
        await insertShipmentStatusHistory(supabase, {
          orderId,
          cdekUuid: shipment.cdek_uuid,
          cdekStatus: nextStatus,
          cdekTrackNumber: nextTrack,
          eventSource,
        });
      }

      if (!primaryShipment) {
        primaryShipment = {
          ...shipment,
          cdek_track_number: nextTrack,
          cdek_status: nextStatus,
        };
      }
    }

    if (!primaryShipment) {
      return {
        ok: true,
        status: "skipped",
        reason: "shipment_not_created",
        order_id: String(row.id),
        origin_profile: isOriginProfile(row.origin_profile) ? row.origin_profile : null,
        cdek_uuid: null,
        cdek_track_number: null,
        cdek_status: null,
      };
    }

    const { error: orderUpdateErr } = await supabase
      .from("tg_orders")
      .update({
        cdek_uuid: primaryShipment.cdek_uuid,
        cdek_track_number: primaryShipment.cdek_track_number,
        cdek_status: primaryShipment.cdek_status,
        cdek_tariff_code: primaryShipment.cdek_tariff_code,
        origin_profile: primaryShipment.origin_profile,
      })
      .eq("id", orderId);
    if (orderUpdateErr) throw new ShipmentProcessError("SHIPMENT_STATUS_SAVE_FAILED", 500, orderUpdateErr.message);

    await applyOrderStatusReconciliation(supabase, {
      orderId,
      currentOrderStatus: typeof row.status === "string" ? row.status : null,
      shipmentStatus: primaryShipment.cdek_status,
      source: eventSource,
    });

    return {
      ok: true,
      status: updatedCount > 0 ? "updated" : "unchanged",
      order_id: String(row.id),
      origin_profile: primaryShipment.origin_profile,
      cdek_uuid: primaryShipment.cdek_uuid,
      cdek_track_number: primaryShipment.cdek_track_number,
      cdek_status: primaryShipment.cdek_status,
    };
  }

  if (!(typeof row.cdek_uuid === "string" && row.cdek_uuid.trim())) {
    logShipmentEvent("shipment_status_sync_skipped", {
      orderId,
      reason: "shipment_not_created",
    });
    return {
      ok: true,
      status: "skipped",
      reason: "shipment_not_created",
      order_id: String(row.id),
      origin_profile: isOriginProfile(row.origin_profile) ? row.origin_profile : null,
      cdek_uuid: null,
      cdek_track_number: typeof row.cdek_track_number === "string" ? row.cdek_track_number : null,
      cdek_status: typeof row.cdek_status === "string" ? row.cdek_status : null,
    };
  }

  let originProfile = isOriginProfile(row.origin_profile) ? row.origin_profile : null;
  if (!originProfile) {
    const { data: post, error: postErr } = await supabase
      .from("tg_posts")
      .select("post_type")
      .eq("id", String(row.post_id))
      .maybeSingle();
    if (postErr) throw new ShipmentProcessError("POST_LOOKUP_FAILED", 500, postErr.message);
    originProfile = deriveOriginProfile(String(((post ?? null) as Record<string, unknown> | null)?.post_type ?? "warehouse"));
  }

  logShipmentEvent("shipment_status_sync_start", {
    orderId,
    originProfile,
    cdekUuid: row.cdek_uuid,
    currentStatus: row.cdek_status ?? null,
  });

  const proxyBase = cdekProxyBaseUrl.replace(/\/+$/, "");
  const statusRes = await fetch(
    `${proxyBase}/api/shipping/status/${encodeURIComponent(String(row.cdek_uuid))}?originProfile=${encodeURIComponent(originProfile)}`,
    { method: "GET" },
  );
  const statusJson = await statusRes.json().catch(() => null) as Record<string, unknown> | null;
  if (!statusRes.ok || !statusJson?.ok) {
    logShipmentEvent("shipment_status_sync_failed", {
      orderId,
      originProfile,
      cdekUuid: row.cdek_uuid,
      httpStatus: statusRes.status,
    });
    throw new ShipmentProcessError("SHIPMENT_STATUS_SYNC_FAILED", 502, statusJson ?? { status: statusRes.status });
  }

  const normalized = normalizeTrackData((statusJson.status ?? null) as Record<string, unknown> | null);
  const nextTrack = normalized.cdekNumber ?? (typeof row.cdek_track_number === "string" ? row.cdek_track_number : null);
  const nextStatus = normalized.cdekStatus ?? (typeof row.cdek_status === "string" ? row.cdek_status : null);
  const changed =
    nextTrack !== (typeof row.cdek_track_number === "string" ? row.cdek_track_number : null) ||
    nextStatus !== (typeof row.cdek_status === "string" ? row.cdek_status : null);

  const { error: updateErr } = await supabase
    .from("tg_orders")
    .update({
      origin_profile: originProfile,
      cdek_track_number: nextTrack,
      cdek_status: nextStatus,
    })
    .eq("id", orderId)
    .eq("cdek_uuid", String(row.cdek_uuid));

  if (updateErr) throw new ShipmentProcessError("SHIPMENT_STATUS_SAVE_FAILED", 500, updateErr.message);

  if (changed) {
    await insertShipmentStatusHistory(supabase, {
      orderId,
      cdekUuid: String(row.cdek_uuid),
      cdekStatus: nextStatus,
      cdekTrackNumber: nextTrack,
      eventSource,
    });
  }

  await applyOrderStatusReconciliation(supabase, {
    orderId,
    currentOrderStatus: typeof row.status === "string" ? row.status : null,
    shipmentStatus: nextStatus,
    source: eventSource,
  });

  logShipmentEvent("shipment_status_sync_completed", {
    orderId,
    originProfile,
    cdekUuid: row.cdek_uuid,
    cdekStatus: nextStatus,
    cdekTrackNumber: nextTrack,
    outcome: changed ? "updated" : "unchanged",
  });

  return {
    ok: true,
    status: changed ? "updated" : "unchanged",
    order_id: String(row.id),
    origin_profile: originProfile,
    cdek_uuid: String(row.cdek_uuid),
    cdek_track_number: nextTrack,
    cdek_status: nextStatus,
  };
}

export async function syncActiveShipments(
  supabase: any,
  cdekProxyBaseUrl: string,
  limit = ACTIVE_SHIPMENT_SYNC_LIMIT,
): Promise<ActiveShipmentSyncBatchResult> {
  const safeLimit = Math.max(1, Math.min(Number(limit) || ACTIVE_SHIPMENT_SYNC_LIMIT, 100));

  logShipmentEvent("shipment_batch_sync_started", {
    limit: safeLimit,
  });

  const { data: shipmentRows, error } = await supabase
    .from("tg_order_shipments")
    .select("order_id, cdek_uuid, cdek_status, updated_at")
    .not("cdek_uuid", "is", null)
    .or("cdek_status.is.null,cdek_status.not.in.(DELIVERED,CANCELLED)")
    .order("updated_at", { ascending: true })
    .limit(safeLimit * 2);

  if (error) {
    throw new ShipmentProcessError("ACTIVE_SHIPMENT_BATCH_LOOKUP_FAILED", 500, error.message);
  }
  const rows = Array.isArray(shipmentRows) ? shipmentRows as Record<string, unknown>[] : [];
  const uniqueOrderIds: string[] = [];
  for (const row of rows) {
    const orderId = String(row.order_id ?? "").trim();
    if (!orderId || uniqueOrderIds.includes(orderId)) continue;
    uniqueOrderIds.push(orderId);
    if (uniqueOrderIds.length >= safeLimit) break;
  }
  const items: ActiveShipmentSyncItemResult[] = [];

  for (const orderId of uniqueOrderIds) {
    const sample = rows.find((row) => String(row.order_id ?? "") === orderId) ?? null;
    const cdekUuid = sample && typeof sample.cdek_uuid === "string" ? sample.cdek_uuid : null;
    const currentStatus = sample && typeof sample.cdek_status === "string" ? sample.cdek_status : null;

    if (isFinalShipmentStatus(currentStatus)) {
      const item: ActiveShipmentSyncItemResult = {
        order_id: orderId,
        cdek_uuid: cdekUuid,
        status: "skipped",
        reason: "final_status",
        cdek_status: currentStatus,
      };
      items.push(item);
      logShipmentEvent("shipment_batch_sync_item", item);
      continue;
    }

    try {
      const result = await syncShipmentStatusForOrder(supabase, cdekProxyBaseUrl, orderId, "scheduled_sync");
      const item: ActiveShipmentSyncItemResult = {
        order_id: result.order_id,
        cdek_uuid: result.cdek_uuid,
        status: result.status,
        cdek_track_number: result.cdek_track_number,
        cdek_status: result.cdek_status,
      };
      items.push(item);
      logShipmentEvent("shipment_batch_sync_item", item);
    } catch (syncError) {
      const item: ActiveShipmentSyncItemResult = {
        order_id: orderId,
        cdek_uuid: cdekUuid,
        status: "failed",
        error: syncError instanceof Error ? syncError.message : "UNKNOWN_ERROR",
      };
      items.push(item);
      logShipmentEvent("shipment_batch_sync_item", item);
    }
  }

  const result: ActiveShipmentSyncBatchResult = {
    ok: true,
    limit: safeLimit,
    processed: items.length,
    updated: items.filter((item) => item.status === "updated").length,
    unchanged: items.filter((item) => item.status === "unchanged").length,
    skipped: items.filter((item) => item.status === "skipped").length,
    failed: items.filter((item) => item.status === "failed").length,
    items,
  };

  logShipmentEvent("shipment_batch_sync_completed", {
    limit: safeLimit,
    processed: result.processed,
    updated: result.updated,
    unchanged: result.unchanged,
    skipped: result.skipped,
    failed: result.failed,
  });

  return result;
}

export async function processShipmentWebhook(
  supabase: any,
  payload: unknown,
): Promise<ShipmentWebhookResult> {
  const normalized = normalizeWebhookShipmentData(payload);

  logShipmentEvent("shipment_webhook_received", {
    cdekUuid: normalized.cdekUuid,
    cdekStatus: normalized.cdekStatus,
    cdekTrackNumber: normalized.cdekNumber,
  });

  if (!normalized.cdekUuid) {
    logShipmentEvent("shipment_webhook_ignored", {
      reason: "shipment_uuid_missing",
      cdekStatus: normalized.cdekStatus,
    });
    return {
      ok: true,
      status: "ignored",
      reason: "shipment_uuid_missing",
      order_id: null,
      cdek_uuid: null,
      cdek_track_number: normalized.cdekNumber,
      cdek_status: normalized.cdekStatus,
    };
  }

  const { data: shipmentRow, error: shipmentLookupErr } = await supabase
    .from("tg_order_shipments")
    .select("id, order_id, origin_profile, cdek_uuid, cdek_track_number, cdek_status, cdek_tariff_code")
    .eq("cdek_uuid", normalized.cdekUuid)
    .maybeSingle();
  if (shipmentLookupErr) {
    throw new ShipmentProcessError("SHIPMENT_WEBHOOK_LOOKUP_FAILED", 500, shipmentLookupErr.message);
  }
  if (shipmentRow) {
    const shipment = shipmentRow as Record<string, unknown>;
    const orderId = String(shipment.order_id ?? "");
    const nextTrack = normalized.cdekNumber ?? (typeof shipment.cdek_track_number === "string" ? shipment.cdek_track_number : null);
    const nextStatus = normalized.cdekStatus ?? (typeof shipment.cdek_status === "string" ? shipment.cdek_status : null);
    const changed =
      nextTrack !== (typeof shipment.cdek_track_number === "string" ? shipment.cdek_track_number : null) ||
      nextStatus !== (typeof shipment.cdek_status === "string" ? shipment.cdek_status : null);

    if (changed) {
      await upsertOrderShipment(supabase, {
        orderId,
        originProfile: isOriginProfile(shipment.origin_profile) ? shipment.origin_profile : "ODN",
        cdekUuid: normalized.cdekUuid,
        cdekTrackNumber: nextTrack,
        cdekStatus: nextStatus,
        cdekTariffCode: Number(shipment.cdek_tariff_code ?? 0) || null,
      });
      await insertShipmentStatusHistory(supabase, {
        orderId,
        cdekUuid: normalized.cdekUuid,
        cdekStatus: nextStatus,
        cdekTrackNumber: nextTrack,
        eventSource: "webhook",
      });
    }

    const { data: primaryRows, error: primaryErr } = await supabase
      .from("tg_order_shipments")
      .select("origin_profile, cdek_uuid, cdek_track_number, cdek_status, cdek_tariff_code")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (primaryErr) throw new ShipmentProcessError("SHIPMENT_WEBHOOK_SAVE_FAILED", 500, primaryErr.message);
    const primary = Array.isArray(primaryRows) && primaryRows.length
      ? primaryRows[0] as Record<string, unknown>
      : shipment;

    const { error: orderUpdateErr } = await supabase
      .from("tg_orders")
      .update({
        origin_profile: isOriginProfile(primary.origin_profile) ? primary.origin_profile : null,
        cdek_uuid: typeof primary.cdek_uuid === "string" ? primary.cdek_uuid : null,
        cdek_track_number: typeof primary.cdek_track_number === "string" ? primary.cdek_track_number : null,
        cdek_status: typeof primary.cdek_status === "string" ? primary.cdek_status : null,
        cdek_tariff_code: Number(primary.cdek_tariff_code ?? 0) || null,
      })
      .eq("id", orderId);
    if (orderUpdateErr) throw new ShipmentProcessError("SHIPMENT_WEBHOOK_SAVE_FAILED", 500, orderUpdateErr.message);

    const { data: orderStatusRow } = await supabase
      .from("tg_orders")
      .select("status")
      .eq("id", orderId)
      .maybeSingle();

    await applyOrderStatusReconciliation(supabase, {
      orderId,
      currentOrderStatus: orderStatusRow && typeof (orderStatusRow as Record<string, unknown>).status === "string"
        ? String((orderStatusRow as Record<string, unknown>).status)
        : null,
      shipmentStatus: nextStatus,
      source: "webhook",
    });

    return {
      ok: true,
      status: changed ? "updated" : "unchanged",
      order_id: orderId,
      cdek_uuid: normalized.cdekUuid,
      cdek_track_number: nextTrack,
      cdek_status: nextStatus,
    };
  }

  const { data: order, error: orderErr } = await supabase
    .from("tg_orders")
    .select(`
      id,
      status,
      cdek_uuid,
      cdek_track_number,
      cdek_status
    `)
    .eq("cdek_uuid", normalized.cdekUuid)
    .maybeSingle();

  if (orderErr) {
    throw new ShipmentProcessError("SHIPMENT_WEBHOOK_LOOKUP_FAILED", 500, orderErr.message);
  }

  if (!order) {
    logShipmentEvent("shipment_webhook_ignored", {
      reason: "shipment_not_matched",
      cdekUuid: normalized.cdekUuid,
      cdekStatus: normalized.cdekStatus,
    });
    return {
      ok: true,
      status: "ignored",
      reason: "shipment_not_matched",
      order_id: null,
      cdek_uuid: normalized.cdekUuid,
      cdek_track_number: normalized.cdekNumber,
      cdek_status: normalized.cdekStatus,
    };
  }

  const row = order as Record<string, unknown>;
  const nextTrack = normalized.cdekNumber ?? (typeof row.cdek_track_number === "string" ? row.cdek_track_number : null);
  const nextStatus = normalized.cdekStatus ?? (typeof row.cdek_status === "string" ? row.cdek_status : null);
  const changed =
    nextTrack !== (typeof row.cdek_track_number === "string" ? row.cdek_track_number : null) ||
    nextStatus !== (typeof row.cdek_status === "string" ? row.cdek_status : null);

  logShipmentEvent("shipment_webhook_matched", {
    orderId: String(row.id),
    cdekUuid: normalized.cdekUuid,
    currentStatus: row.cdek_status ?? null,
    nextStatus,
  });

  if (!changed) {
    await applyOrderStatusReconciliation(supabase, {
      orderId: String(row.id),
      currentOrderStatus: typeof row.status === "string" ? row.status : null,
      shipmentStatus: nextStatus,
      source: "webhook",
    });
    logShipmentEvent("shipment_webhook_unchanged", {
      orderId: String(row.id),
      cdekUuid: normalized.cdekUuid,
      cdekStatus: nextStatus,
      cdekTrackNumber: nextTrack,
    });
    return {
      ok: true,
      status: "unchanged",
      order_id: String(row.id),
      cdek_uuid: normalized.cdekUuid,
      cdek_track_number: nextTrack,
      cdek_status: nextStatus,
    };
  }

  const { error: updateErr } = await supabase
    .from("tg_orders")
    .update({
      cdek_track_number: nextTrack,
      cdek_status: nextStatus,
    })
    .eq("id", String(row.id))
    .eq("cdek_uuid", normalized.cdekUuid);

  if (updateErr) {
    throw new ShipmentProcessError("SHIPMENT_WEBHOOK_SAVE_FAILED", 500, updateErr.message);
  }

  await insertShipmentStatusHistory(supabase, {
    orderId: String(row.id),
    cdekUuid: normalized.cdekUuid,
    cdekStatus: nextStatus,
    cdekTrackNumber: nextTrack,
    eventSource: "webhook",
  });

  await applyOrderStatusReconciliation(supabase, {
    orderId: String(row.id),
    currentOrderStatus: typeof row.status === "string" ? row.status : null,
    shipmentStatus: nextStatus,
    source: "webhook",
  });

  logShipmentEvent("shipment_webhook_updated", {
    orderId: String(row.id),
    cdekUuid: normalized.cdekUuid,
    cdekStatus: nextStatus,
    cdekTrackNumber: nextTrack,
  });

  return {
    ok: true,
    status: "updated",
    order_id: String(row.id),
    cdek_uuid: normalized.cdekUuid,
    cdek_track_number: nextTrack,
    cdek_status: nextStatus,
  };
}
