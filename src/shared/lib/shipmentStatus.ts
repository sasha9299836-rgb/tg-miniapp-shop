type UnifiedOrderStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

type UnifiedOrderStatusInput = {
  orderStatus?: string | null;
  cdekUuid?: string | null;
  cdekStatus?: string | null;
  cdekTrackNumber?: string | null;
};

type AdminOperationalStatusInput = UnifiedOrderStatusInput & {
  shipmentCreateInProgress?: boolean | null;
  shipmentCreateStartedAt?: string | null;
};

export type UnifiedOrderStatus = {
  shortLabel: string;
  longLabel: string;
  tone: UnifiedOrderStatusTone;
  step: number;
  canTrack: boolean;
  hasShipment: boolean;
  delivered: boolean;
  readyForPickup: boolean;
};

export type OperationalBadge = {
  label: string;
  tone: UnifiedOrderStatusTone;
};

export type AdminOperationalStatus = UnifiedOrderStatus & {
  badges: OperationalBadge[];
  needsAttention: boolean;
  staleLockCandidate: boolean;
  shipmentFinal: boolean;
  shipmentActive: boolean;
  deliveryLabel: string;
};

const STALE_LOCK_THRESHOLD_MS = 15 * 60 * 1000;

function normalize(value?: string | null): string {
  return String(value ?? "").trim();
}

function isFinalShipmentStatus(status?: string | null): boolean {
  const normalized = normalize(status);
  return normalized === "DELIVERED" || normalized === "CANCELLED";
}

function isActiveShipmentStatus(status?: string | null): boolean {
  const normalized = normalize(status);
  return normalized === "CREATED" || normalized === "ACCEPTED" || normalized === "IN_TRANSIT" || normalized === "READY_FOR_PICKUP";
}

export function isLikelyStaleShipmentLock(startedAt?: string | null): boolean {
  const normalized = normalize(startedAt);
  if (!normalized) return false;

  const startedMs = new Date(normalized).getTime();
  if (!Number.isFinite(startedMs)) return false;

  return Date.now() - startedMs >= STALE_LOCK_THRESHOLD_MS;
}

export function formatCdekStatus(status?: string | null): string {
  switch (normalize(status)) {
    case "CREATED":
      return "Отправление создано";
    case "ACCEPTED":
      return "Зарегистрировано в СДЭК";
    case "IN_TRANSIT":
      return "В пути";
    case "READY_FOR_PICKUP":
      return "Готов к выдаче";
    case "DELIVERED":
      return "Получен";
    case "CANCELLED":
      return "Отменен службой доставки";
    default:
      return normalize(status) || "Статус доставки неизвестен";
  }
}

export function getCdekTrackingUrl(trackNumber?: string | null): string | null {
  const normalized = normalize(trackNumber);
  if (!normalized) return null;
  return `https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(normalized)}`;
}

export function getUnifiedOrderStatus(input: UnifiedOrderStatusInput): UnifiedOrderStatus {
  const orderStatus = normalize(input.orderStatus);
  const cdekStatus = normalize(input.cdekStatus);
  const hasShipment = Boolean(normalize(input.cdekUuid) || normalize(input.cdekTrackNumber));
  const canTrack = Boolean(normalize(input.cdekTrackNumber));

  if (orderStatus === "rejected" || orderStatus === "cancelled" || orderStatus === "expired") {
    return {
      shortLabel: "Отменен",
      longLabel: "Заказ отменен или резерв больше не активен.",
      tone: "danger",
      step: 0,
      canTrack: false,
      hasShipment,
      delivered: false,
      readyForPickup: false,
    };
  }

  if (orderStatus === "created" || orderStatus === "awaiting_payment_proof") {
    return {
      shortLabel: "Ожидает оплаты",
      longLabel: "Ждем подтверждение оплаты, после этого начнем оформление отправления.",
      tone: "warning",
      step: 1,
      canTrack: false,
      hasShipment,
      delivered: false,
      readyForPickup: false,
    };
  }

  if (orderStatus === "payment_proof_submitted") {
    return {
      shortLabel: "Проверяем оплату",
      longLabel: "Подтверждение оплаты получено. Как только проверка завершится, начнем оформление доставки.",
      tone: "warning",
      step: 1,
      canTrack: false,
      hasShipment,
      delivered: false,
      readyForPickup: false,
    };
  }

  if (orderStatus === "completed") {
    return {
      shortLabel: "Завершен",
      longLabel: "Заказ получен и завершен.",
      tone: "success",
      step: 6,
      canTrack,
      hasShipment,
      delivered: true,
      readyForPickup: false,
    };
  }

  if (orderStatus === "ready_for_pickup") {
    return {
      shortLabel: "Готов к выдаче",
      longLabel: "Заказ уже ждет получателя в пункте выдачи.",
      tone: "success",
      step: 5,
      canTrack,
      hasShipment,
      delivered: false,
      readyForPickup: true,
    };
  }

  if (cdekStatus === "DELIVERED" || cdekStatus === "READY_FOR_PICKUP") {
    return {
      shortLabel: "Статус обновляется",
      longLabel: "Доставка уже перешла на следующий этап. Сервер синхронизирует итоговый статус заказа.",
      tone: "info",
      step: cdekStatus === "DELIVERED" ? 6 : 5,
      canTrack,
      hasShipment: true,
      delivered: false,
      readyForPickup: false,
    };
  }

  if (cdekStatus === "IN_TRANSIT") {
    return {
      shortLabel: "В пути",
      longLabel: "Заказ передан в доставку и находится в пути.",
      tone: "info",
      step: 4,
      canTrack,
      hasShipment: true,
      delivered: false,
      readyForPickup: false,
    };
  }

  if (cdekStatus === "ACCEPTED") {
    return {
      shortLabel: canTrack ? "Трек-номер создан" : "Отправление создано",
      longLabel: canTrack
        ? "Отправление зарегистрировано, трек-номер уже доступен. Ждем движение по доставке."
        : "Отправление зарегистрировано в СДЭК. Ждем присвоение трек-номера и движение по доставке.",
      tone: "info",
      step: 2,
      canTrack,
      hasShipment: true,
      delivered: false,
      readyForPickup: false,
    };
  }

  if (cdekStatus === "CREATED") {
    return {
      shortLabel: "Отправление создано",
      longLabel: "Отправление оформлено. Ожидаем передачу в СДЭК.",
      tone: "info",
      step: 2,
      canTrack,
      hasShipment: true,
      delivered: false,
      readyForPickup: false,
    };
  }

  if (hasShipment) {
    return {
      shortLabel: "Готовится к отправке",
      longLabel: "Отправление уже создано, статус доставки скоро обновится.",
      tone: "info",
      step: 2,
      canTrack,
      hasShipment: true,
      delivered: false,
      readyForPickup: false,
    };
  }

  if (orderStatus === "payment_confirmed" || orderStatus === "paid") {
    return {
      shortLabel: "Готовится к отправке",
      longLabel: "Оплата подтверждена. Сейчас готовим отправление к передаче в СДЭК.",
      tone: "neutral",
      step: 2,
      canTrack: false,
      hasShipment: false,
      delivered: false,
      readyForPickup: false,
    };
  }

  return {
    shortLabel: "Статус уточняется",
    longLabel: "Мы обновим информацию по заказу, как только появятся новые данные.",
    tone: "neutral",
    step: 0,
    canTrack,
    hasShipment,
    delivered: false,
    readyForPickup: false,
  };
}

export function getAdminOperationalStatus(input: AdminOperationalStatusInput): AdminOperationalStatus {
  const base = getUnifiedOrderStatus(input);
  const cdekStatus = normalize(input.cdekStatus);
  const hasTrack = Boolean(normalize(input.cdekTrackNumber));
  const hasUuid = Boolean(normalize(input.cdekUuid));
  const inProgress = Boolean(input.shipmentCreateInProgress);
  const staleLockCandidate = inProgress && !hasUuid && isLikelyStaleShipmentLock(input.shipmentCreateStartedAt);
  const shipmentFinal = isFinalShipmentStatus(cdekStatus);
  const shipmentActive = isActiveShipmentStatus(cdekStatus);

  const badges: OperationalBadge[] = [];

  if (input.orderStatus === "payment_proof_submitted") {
    badges.push({ label: "Нужна проверка оплаты", tone: "warning" });
  }

  if (input.orderStatus === "payment_confirmed" || input.orderStatus === "paid" || input.orderStatus === "ready_for_pickup" || input.orderStatus === "completed") {
    badges.push({ label: "Оплата подтверждена", tone: "success" });
  }

  if (hasUuid) {
    badges.push({ label: "Shipment создан", tone: "info" });
  }

  if (hasTrack) {
    badges.push({ label: "Трек присвоен", tone: "info" });
  }

  if (inProgress) {
    badges.push({ label: "Create in progress", tone: staleLockCandidate ? "danger" : "warning" });
  }

  if (cdekStatus) {
    badges.push({ label: "Статус синхронизирован", tone: "neutral" });
  }

  if (shipmentFinal) {
    badges.push({ label: "Доставка завершена", tone: "success" });
  } else if (shipmentActive) {
    badges.push({ label: "Доставка активна", tone: "info" });
  }

  if (staleLockCandidate) {
    return {
      shortLabel: "Требуется внимание",
      longLabel: "Похоже, создание shipment зависло. Проверьте lock и при необходимости выполните recovery.",
      tone: "danger",
      step: base.step,
      canTrack: base.canTrack,
      hasShipment: base.hasShipment,
      delivered: base.delivered,
      readyForPickup: base.readyForPickup,
      badges,
      needsAttention: true,
      staleLockCandidate,
      shipmentFinal,
      shipmentActive,
      deliveryLabel: cdekStatus ? formatCdekStatus(cdekStatus) : "Статус доставки еще не получен",
    };
  }

  if (inProgress && !hasUuid) {
    return {
      shortLabel: "Создается отправление",
      longLabel: "Server-side flow уже оформляет shipment. Дождитесь завершения create или проверьте статус позже.",
      tone: "info",
      step: 2,
      canTrack: false,
      hasShipment: false,
      delivered: false,
      readyForPickup: false,
      badges,
      needsAttention: false,
      staleLockCandidate,
      shipmentFinal,
      shipmentActive,
      deliveryLabel: cdekStatus ? formatCdekStatus(cdekStatus) : "Статус доставки еще не получен",
    };
  }

  if (input.orderStatus === "payment_proof_submitted") {
    return {
      shortLabel: "Нужно проверить оплату",
      longLabel: "Подтверждение оплаты загружено. Следующее действие администратора — проверить оплату и подтвердить заказ.",
      tone: "warning",
      step: 1,
      canTrack: false,
      hasShipment: false,
      delivered: false,
      readyForPickup: false,
      badges,
      needsAttention: true,
      staleLockCandidate,
      shipmentFinal,
      shipmentActive,
      deliveryLabel: cdekStatus ? formatCdekStatus(cdekStatus) : "Доставка еще не создана",
    };
  }

  return {
    ...base,
    badges,
    needsAttention: false,
    staleLockCandidate,
    shipmentFinal,
    shipmentActive,
    deliveryLabel: cdekStatus ? formatCdekStatus(cdekStatus) : base.hasShipment ? "Отправление создано" : "Доставка еще не создана",
  };
}

export function getShipmentStatusSummary(params: {
  cdekUuid?: string | null;
  cdekStatus?: string | null;
  cdekTrackNumber?: string | null;
}) {
  if (params.cdekStatus) {
    return {
      label: formatCdekStatus(params.cdekStatus),
      track: normalize(params.cdekTrackNumber) || null,
      hasShipment: true,
    };
  }

  if (params.cdekUuid || params.cdekTrackNumber) {
    return {
      label: "Отправление создано",
      track: normalize(params.cdekTrackNumber) || null,
      hasShipment: true,
    };
  }

  return {
    label: "Доставка еще не отслеживается",
    track: null,
    hasShipment: false,
  };
}
