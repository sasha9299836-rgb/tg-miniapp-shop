import { useEffect, useMemo, useState } from "react";
import { Page } from "../../../shared/ui/Page";
import { Button } from "../../../shared/ui/Button";
import {
  confirmOrderAndFinalizeShipment,
  getAdminOrderEvents,
  getShipmentStatusHistory,
  listOrdersByStatuses,
  listOrderItemsByOrderIds,
  listOrderShipmentsByOrderIds,
  listShipmentStatusHistoryByOrderIds,
  recoverStaleShipmentLock,
  rejectOrderPayment,
  syncActiveShipments,
  syncShipmentStatus,
  type AdminOrderEvent,
  type ShipmentStatusHistoryEntry,
  type SyncActiveShipmentsBatchResult,
  type TgOrderItem,
  type TgOrderShipment,
  type TgOrder,
} from "../../../shared/api/ordersApi";
import { getPaymentProofGetPresign } from "../../../shared/api/paymentProofApi";
import { supabase } from "../../../shared/api/supabaseClient";
import {
  formatCdekStatus,
  getAdminOperationalStatus,
  getCdekTrackingUrl,
  isLikelyStaleShipmentLock,
} from "../../../shared/lib/shipmentStatus";
import { getAdminActionErrorMessage, getBatchShipmentSyncErrorMessage } from "../../../shared/lib/adminErrors";
import "./styles.css";

type Tab = "proof" | "expired" | "confirmed" | "rejected";

type PostMeta = {
  nalichie_id: number | null;
  title: string | null;
  post_type: "warehouse" | "consignment" | null;
  origin_profile: "ODN" | "YAN" | null;
};

type TimelineRow = {
  key: string;
  label: string;
  time: string;
  kind: "order" | "shipment";
  meta?: string | null;
};

type ConfirmationDialogState =
  | {
      kind: "confirm_payment";
      order: TgOrder;
    }
  | {
      kind: "reject_payment";
      order: TgOrder;
    }
  | {
      kind: "batch_sync";
    };

const statusByTab: Record<Tab, TgOrder["status"][]> = {
  proof: ["payment_proof_submitted"],
  expired: ["expired"],
  confirmed: ["payment_confirmed", "paid", "ready_for_pickup", "completed"],
  rejected: ["rejected"],
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function formatOrderStatus(status: TgOrder["status"]): string {
  switch (status) {
    case "awaiting_payment_proof":
      return "Ожидает оплату";
    case "payment_proof_submitted":
      return "Проверка оплаты";
    case "payment_confirmed":
    case "paid":
      return "Оплачен";
    case "ready_for_pickup":
      return "Готов к выдаче";
    case "completed":
      return "Завершен";
    case "rejected":
      return "Отклонен";
    case "expired":
      return "Резерв истек";
    case "cancelled":
      return "Отменен";
    case "created":
      return "Создан";
    default:
      return status;
  }
}

function formatOrderEvent(event: string): string {
  switch (event) {
    case "created":
      return "Заказ создан";
    case "payment_proof_submitted":
      return "Загружено подтверждение оплаты";
    case "confirmed":
      return "Оплата подтверждена";
    case "rejected":
      return "Оплата отклонена";
    case "expired":
      return "Резерв истек";
    default:
      return event;
  }
}

function formatOriginProfileLabel(originProfile: string): string {
  if (originProfile === "ODN") return "Одинцово";
  if (originProfile === "YAN") return "Янино";
  return originProfile;
}

function buildOriginLabel(originProfiles: string[]): string {
  const unique = [...new Set(originProfiles.filter(Boolean))];
  if (!unique.length) return "Склад";
  if (unique.length === 1) return formatOriginProfileLabel(unique[0]);
  if (unique.includes("ODN") && unique.includes("YAN")) return "Одинцово + Янино";
  return unique.map(formatOriginProfileLabel).join(" + ");
}

function buildTimelineRows(order: TgOrder, orderEvents: AdminOrderEvent[], shipmentHistory: ShipmentStatusHistoryEntry[]): TimelineRow[] {
  const rows: TimelineRow[] = [];

  for (const event of orderEvents) {
    rows.push({
      key: `order-${event.id}`,
      label: formatOrderEvent(event.event),
      time: event.created_at,
      kind: "order",
      meta: null,
    });
  }

  const filteredHistory = order.cdek_uuid
    ? shipmentHistory.filter((entry) => !entry.cdek_uuid || entry.cdek_uuid === order.cdek_uuid)
    : shipmentHistory;

  for (const entry of filteredHistory) {
    rows.push({
      key: `shipment-${entry.id}`,
      label: formatCdekStatus(entry.cdek_status),
      time: entry.created_at,
      kind: "shipment",
      meta: entry.cdek_track_number ? `Трек: ${entry.cdek_track_number}` : null,
    });
  }

  if (!filteredHistory.length && order.cdek_status) {
    rows.push({
      key: `shipment-current-${order.id}`,
      label: formatCdekStatus(order.cdek_status),
      time: order.updated_at,
      kind: "shipment",
      meta: order.cdek_track_number ? `Трек: ${order.cdek_track_number}` : "Текущий статус",
    });
  }

  return rows.sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
}

function getHistorySummary(entries: ShipmentStatusHistoryEntry[], order: TgOrder): string {
  const filtered = order.cdek_uuid
    ? entries.filter((entry) => !entry.cdek_uuid || entry.cdek_uuid === order.cdek_uuid)
    : entries;

  if (!filtered.length) {
    return order.cdek_status ? `Текущий статус: ${formatCdekStatus(order.cdek_status)}` : "История доставки пока пуста";
  }

  const latest = [...filtered].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0];
  return `${formatCdekStatus(latest.cdek_status)} · ${formatDate(latest.created_at)}`;
}

function formatBatchSyncResult(result: SyncActiveShipmentsBatchResult): string {
  return `Статусы доставки обновлены: ${result.updated} обновлено, ${result.unchanged} без изменений, ${result.failed} с ошибками.`;
}

function getShipmentCreateErrorMessage(code: string): string {
  switch (code) {
    case "ORIGIN_PROFILE_REQUIRED":
      return "Не удалось создать отправление: не указан профиль отправки.";
    case "PACKAGING_PRESET_REQUIRED":
      return "Не удалось создать отправление: не указана упаковка.";
    case "PACKAGE_DIMENSIONS_REQUIRED":
      return "Не удалось создать отправление: не заполнены размеры упаковки.";
    case "RECEIVER_CITY_CODE_REQUIRED":
      return "Не удалось создать отправление: не выбран город получателя.";
    case "DELIVERY_POINT_REQUIRED":
      return "Не удалось создать отправление: не выбран пункт выдачи.";
    case "RECIPIENT_REQUIRED":
      return "Не удалось создать отправление: не заполнены данные получателя.";
    case "CREDENTIALS_MISSING":
      return "Не удалось создать отправление: не настроены ключи службы доставки.";
    case "TOKEN_REQUEST_FAILED":
    case "TOKEN_RESPONSE_INVALID":
      return "Не удалось создать отправление: ошибка авторизации службы доставки.";
    case "TARIFF_NOT_AVAILABLE":
      return "Не удалось создать отправление: для заказа не найден подходящий тариф доставки.";
    case "CDEK_REQUEST_FAILED":
      return "Не удалось создать отправление: служба доставки отклонила запрос.";
    case "CDEK_PROXY_UNREACHABLE":
      return "Не удалось создать отправление: служба доставки временно недоступна.";
    case "SHIPMENT_LOCK_FAILED":
    case "SHIPMENT_LOCK_RELEASE_FAILED":
      return "Не удалось создать отправление: внутренний конфликт блокировки. Повторите попытку.";
    case "SHIPMENT_SAVE_FAILED":
      return "Не удалось создать отправление: ошибка сохранения данных отправления.";
    default:
      return `Не удалось создать отправление: код ошибки ${code}. Проверьте журналы сервера.`;
  }
}

type OrderCardProps = {
  order: TgOrder;
  orderItems: TgOrderItem[];
  orderShipments: TgOrderShipment[];
  historyTrackNumbers: string[];
  originLabel: string;
  previewUrl?: string;
  postMeta?: PostMeta;
  isBusy: boolean;
  isExpanded: boolean;
  onOpenOrder: (orderId: string) => void;
  onOpenProof: (orderId: string) => Promise<void>;
  onRequestConfirm: (order: TgOrder) => void;
  onRequestReject: (order: TgOrder) => void;
  onRecoverShipmentLock: (order: TgOrder) => Promise<void>;
  onSyncShipmentStatus: (order: TgOrder) => Promise<void>;
  onCopyTrackNumber: (trackNumber: string) => Promise<void>;
  rejectReason: string;
  onRejectReasonChange: (value: string) => void;
};

function AdminOrderCard(props: OrderCardProps) {
  const {
    order,
    orderItems,
    orderShipments,
    historyTrackNumbers,
    originLabel,
    previewUrl,
    postMeta,
    isBusy,
    isExpanded,
    onOpenOrder,
    onOpenProof,
    onRequestConfirm,
    onRequestReject,
    onRecoverShipmentLock,
    onSyncShipmentStatus,
    onCopyTrackNumber,
    rejectReason,
    onRejectReasonChange,
  } = props;

  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [orderEvents, setOrderEvents] = useState<AdminOrderEvent[]>([]);
  const [shipmentHistory, setShipmentHistory] = useState<ShipmentStatusHistoryEntry[]>([]);

  const operational = useMemo(
    () =>
      getAdminOperationalStatus({
        orderStatus: order.status,
        cdekUuid: order.cdek_uuid,
        cdekStatus: order.cdek_status,
        cdekTrackNumber: order.cdek_track_number,
        shipmentCreateInProgress: order.shipment_create_in_progress,
        shipmentCreateStartedAt: order.shipment_create_started_at,
      }),
    [order],
  );

  const trackList = orderShipments
    .filter((shipment) => shipment.cdek_track_number)
    .map((shipment) => `${formatOriginProfileLabel(shipment.origin_profile)}: ${shipment.cdek_track_number}`);
  const fallbackTrackList = historyTrackNumbers.filter((value) => !trackList.some((line) => line.includes(value)));
  const detailsTrackValue = trackList.length
    ? trackList.join(", ")
    : fallbackTrackList.length
      ? fallbackTrackList.join(", ")
      : (order.cdek_track_number || null);
  const primaryTrackNumber = trackList.length
    ? trackList[0].split(": ").slice(1).join(": ").trim()
    : fallbackTrackList.length
      ? fallbackTrackList[0]
      : (order.cdek_track_number ?? null);
  const trackingUrl = getCdekTrackingUrl(primaryTrackNumber);
  const canConfirm = order.status === "payment_proof_submitted";
  const canRecoverLock = Boolean(order.shipment_create_in_progress && !order.cdek_uuid && isLikelyStaleShipmentLock(order.shipment_create_started_at));
  const timelineRows = useMemo(() => buildTimelineRows(order, orderEvents, shipmentHistory), [order, orderEvents, shipmentHistory]);
  const historySummary = useMemo(() => getHistorySummary(shipmentHistory, order), [shipmentHistory, order]);

  useEffect(() => {
    if (!timelineOpen || orderEvents.length || shipmentHistory.length || timelineLoading) {
      return;
    }

    let cancelled = false;

    const loadTimeline = async () => {
      setTimelineLoading(true);
      setTimelineError(null);
      try {
        const [events, history] = await Promise.all([
          getAdminOrderEvents(order.id),
          getShipmentStatusHistory(order.id),
        ]);

        if (cancelled) return;
        setOrderEvents(events);
        setShipmentHistory(history);
      } catch (error) {
        if (cancelled) return;
        setTimelineError(error instanceof Error ? error.message : "TIMELINE_LOAD_FAILED");
      } finally {
        if (!cancelled) {
          setTimelineLoading(false);
        }
      }
    };

    void loadTimeline();

    return () => {
      cancelled = true;
    };
  }, [timelineOpen, order.id, orderEvents.length, shipmentHistory.length, timelineLoading]);

  return (
    <div className="glass admin-order-card">
      <div className="admin-order-card__header">
        <div className="admin-order-card__product">
          {previewUrl ? (
            <img src={previewUrl} alt="Товар" className="admin-order-card__preview" />
          ) : (
            <div className="admin-order-card__preview admin-order-card__preview--empty" />
          )}
          <div className="admin-order-card__title-block">
            <div className="admin-order-card__title">
              Заказ {order.id.slice(0, 8)} · {postMeta?.title ?? "Пост"}
            </div>
            <div className="admin-order-card__subtitle">
              {originLabel} · {order.delivery_type === "pickup" ? "Пункт выдачи" : "До двери"} · Товаров: {Math.max(1, orderItems.length)}
            </div>
          </div>
        </div>
        <span className={`admin-order-status-pill admin-order-status-pill--${operational.tone}`}>
          {operational.shortLabel}
        </span>
      </div>

      <div className="admin-quick-actions">
        {canConfirm ? (
          <Button variant="secondary" disabled={isBusy} onClick={() => onRequestConfirm(order)}>Подтвердить оплату</Button>
        ) : null}
        {canConfirm ? (
          <Button variant="secondary" disabled={isBusy} onClick={() => onRequestReject(order)}>Отклонить оплату</Button>
        ) : null}
        <Button variant="secondary" disabled={isBusy} onClick={() => onOpenOrder(order.id)}>Открыть заказ</Button>
        {trackingUrl ? (
          <Button variant="secondary" disabled={isBusy} onClick={() => window.open(trackingUrl, "_blank", "noopener,noreferrer")}>Отслеживание посылки</Button>
        ) : null}
        {primaryTrackNumber ? (
          <Button variant="secondary" disabled={isBusy} onClick={() => void onCopyTrackNumber(primaryTrackNumber)}>Копировать номер отправления</Button>
        ) : null}
      </div>

      {trackList.length ? (
        <div style={{ marginTop: 8, color: "var(--muted)" }}>
          <div style={{ color: "var(--text)", fontWeight: 600 }}>{trackList.length > 1 ? "Трек-номера" : "Трек-номер"}</div>
          {trackList.map((line) => <div key={`${order.id}-${line}`}>{line}</div>)}
        </div>
      ) : fallbackTrackList.length ? (
        <div style={{ marginTop: 8, color: "var(--muted)" }}>
          <div style={{ color: "var(--text)", fontWeight: 600 }}>{fallbackTrackList.length > 1 ? "Трек-номера" : "Трек-номер"}</div>
          {fallbackTrackList.map((line) => <div key={`${order.id}-${line}`}>{line}</div>)}
        </div>
      ) : order.cdek_track_number ? (
        <div style={{ marginTop: 8, color: "var(--muted)" }}>
          <div style={{ color: "var(--text)", fontWeight: 600 }}>Трек-номер</div>
          <div>{order.cdek_track_number}</div>
        </div>
      ) : null}

      <div className="admin-operational-block" style={{ display: "none" }}>
        <div className="admin-operational-block__header">
          <div>
            <div className="admin-operational-block__title">Состояние заказа</div>
            <div className="admin-operational-block__summary">{operational.longLabel}</div>
          </div>
        </div>

        <div className="admin-operational-badges">
          <span className={`admin-badge admin-badge--${operational.tone}`}>Итог: {operational.shortLabel}</span>
          {operational.badges.map((badge) => (
            <span key={`${order.id}-${badge.label}`} className={`admin-badge admin-badge--${badge.tone}`}>
              {badge.label}
            </span>
          ))}
        </div>

        <div className="admin-operational-grid">
          <div className="admin-operational-field">
            <div className="admin-operational-field__label">Статус заказа</div>
            <div className="admin-operational-field__value">{formatOrderStatus(order.status)}</div>
          </div>
          <div className="admin-operational-field">
            <div className="admin-operational-field__label">Доставка</div>
            <div className="admin-operational-field__value">{operational.deliveryLabel}</div>
          </div>
          <div className="admin-operational-field">
            <div className="admin-operational-field__label">Трек-номер</div>
            <div className="admin-operational-field__value">{trackList.length ? trackList.join(", ") : (order.cdek_track_number || "—")}</div>
          </div>
          <div className="admin-operational-field">
            <div className="admin-operational-field__label">UUID отправления</div>
            <div className="admin-operational-field__value admin-operational-field__value--mono">{order.cdek_uuid || "—"}</div>
          </div>
          <div className="admin-operational-field">
            <div className="admin-operational-field__label">Блокировка оформления</div>
            <div className="admin-operational-field__value">
              {order.shipment_create_in_progress ? "оформляется" : "свободна"}
              {order.shipment_create_started_at ? ` · ${formatDate(order.shipment_create_started_at)}` : ""}
            </div>
          </div>
          <div className="admin-operational-field">
            <div className="admin-operational-field__label">История доставки</div>
            <div className="admin-operational-field__value">{historySummary}</div>
          </div>
        </div>

        {isExpanded ? (
          <>
            <div className="admin-operational-actions">
              {order.payment_proof_key ? (
                <Button variant="secondary" disabled={isBusy} onClick={() => void onOpenProof(order.id)}>Открыть подтверждение оплаты</Button>
              ) : null}

              {order.cdek_uuid ? (
                <Button variant="secondary" disabled={isBusy} onClick={() => void onSyncShipmentStatus(order)}>Обновить статус по заказу</Button>
              ) : null}

              {canRecoverLock ? (
                <Button variant="secondary" disabled={isBusy} onClick={() => void onRecoverShipmentLock(order)}>Снять зависшую блокировку отправления</Button>
              ) : null}
            </div>

            {canConfirm ? (
              <div className="admin-operational-reject">
                <input
                  placeholder="Причина отклонения"
                  value={rejectReason}
                  disabled={isBusy}
                  onChange={(event) => onRejectReasonChange(event.target.value)}
                  className="admin-operational-reject__input"
                />
              </div>
            ) : null}

            <details className="admin-operational-timeline" open={timelineOpen} onToggle={(event) => setTimelineOpen((event.currentTarget as HTMLDetailsElement).open)}>
              <summary>Лента событий</summary>
              <div className="admin-operational-timeline__content">
                {timelineLoading ? <div className="admin-operational-empty">Загрузка событий...</div> : null}
                {timelineError ? <div className="admin-operational-error">Ошибка загрузки событий: {timelineError}</div> : null}
                {!timelineLoading && !timelineError && timelineRows.length ? (
                  <div className="admin-operational-timeline__list">
                    {timelineRows.map((row) => (
                      <div key={row.key} className="admin-operational-timeline__item">
                        <div>
                          <div className="admin-operational-timeline__label">{row.label}</div>
                          {row.meta ? <div className="admin-operational-timeline__meta">{row.meta}</div> : null}
                        </div>
                        <div className="admin-operational-timeline__time">
                          <span className={`admin-badge admin-badge--${row.kind === "shipment" ? "info" : "neutral"}`}>
                            {row.kind === "shipment" ? "Доставка" : "Заказ"}
                          </span>
                          <span>{formatDate(row.time)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {!timelineLoading && !timelineError && !timelineRows.length ? (
                  <div className="admin-operational-empty">Событий по заказу пока нет.</div>
                ) : null}
              </div>
            </details>
          </>
        ) : null}
      </div>

      {isExpanded ? (
        <div className="admin-order-card__details-grid">
          <div>Сумма: {order.price_rub ?? 0} ₽</div>
          <div>ФИО: {order.fio}</div>
          <div>Телефон: {order.phone}</div>
          <div>Создан: {formatDate(order.created_at)}</div>
          {detailsTrackValue ? <div>Трек-номер: {detailsTrackValue}</div> : null}
          <div>
            Адрес: {order.delivery_type === "pickup"
              ? `${order.city ?? ""}, ${order.cdek_pvz_address ?? ""} (${order.cdek_pvz_code ?? ""})`
              : `${order.city ?? ""}, ${order.street ?? ""}, ${order.house ?? ""}, подъезд ${order.entrance ?? "—"}, кв. ${order.apartment ?? "—"}, этаж ${order.floor ?? "—"}`}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminOrdersPage() {
  const [tab, setTab] = useState<Tab>("proof");
  const [orders, setOrders] = useState<TgOrder[]>([]);
  const [previewByPost, setPreviewByPost] = useState<Record<string, string>>({});
  const [postMetaById, setPostMetaById] = useState<Record<string, PostMeta>>({});
  const [orderItemsByOrderId, setOrderItemsByOrderId] = useState<Record<string, TgOrderItem[]>>({});
  const [orderShipmentsByOrderId, setOrderShipmentsByOrderId] = useState<Record<string, TgOrderShipment[]>>({});
  const [historyTrackNumbersByOrderId, setHistoryTrackNumbersByOrderId] = useState<Record<string, string[]>>({});
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [isBatchSyncRunning, setIsBatchSyncRunning] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [confirmationDialog, setConfirmationDialog] = useState<ConfirmationDialogState | null>(null);

  const load = async (currentTab: Tab) => {
    setIsLoading(true);
    try {
      const orderRows = await listOrdersByStatuses(statusByTab[currentTab]);
      const orderIds = orderRows.map((row) => row.id);
      const [orderItems, orderShipments, shipmentHistory] = await Promise.all([
        listOrderItemsByOrderIds(orderIds),
        listOrderShipmentsByOrderIds(orderIds),
        listShipmentStatusHistoryByOrderIds(orderIds),
      ]);
      const groupedOrderItems = orderItems.reduce<Record<string, TgOrderItem[]>>((acc, item) => {
        if (!acc[item.order_id]) acc[item.order_id] = [];
        acc[item.order_id].push(item);
        return acc;
      }, {});
      const groupedOrderShipments = orderShipments.reduce<Record<string, TgOrderShipment[]>>((acc, shipment) => {
        if (!acc[shipment.order_id]) acc[shipment.order_id] = [];
        acc[shipment.order_id].push(shipment);
        return acc;
      }, {});
      const groupedHistoryTracks = shipmentHistory.reduce<Record<string, string[]>>((acc, entry) => {
        const trackNumber = String(entry.cdek_track_number ?? "").trim();
        if (!trackNumber) return acc;
        if (!acc[entry.order_id]) acc[entry.order_id] = [];
        if (!acc[entry.order_id].includes(trackNumber)) {
          acc[entry.order_id].push(trackNumber);
        }
        return acc;
      }, {});
      setOrderItemsByOrderId(groupedOrderItems);
      setOrderShipmentsByOrderId(groupedOrderShipments);
      setHistoryTrackNumbersByOrderId(groupedHistoryTracks);

      const postIds = [...new Set(orderRows.flatMap((row) => {
        const fromItems = (groupedOrderItems[row.id] ?? []).map((item) => item.post_id);
        if (fromItems.length) return fromItems;
        return row.post_id ? [row.post_id] : [];
      }))];
      const previews: Record<string, string> = {};
      const postMeta: Record<string, PostMeta> = {};

      if (postIds.length) {
        const [{ data: photos, error: photosErr }, { data: posts, error: postsErr }] = await Promise.all([
          supabase
            .from("tg_post_photos")
            .select("post_id, url, photo_no")
            .in("post_id", postIds)
            .order("photo_no", { ascending: true }),
          supabase
            .from("tg_posts")
            .select("id, nalichie_id, title, post_type, origin_profile")
            .in("id", postIds),
        ]);

        if (photosErr) throw photosErr;
        if (postsErr) throw postsErr;

        (photos ?? []).forEach((row) => {
          const entry = row as { post_id: string; url: string };
          if (!previews[entry.post_id]) previews[entry.post_id] = entry.url;
        });

        (posts ?? []).forEach((row) => {
          const entry = row as {
            id: string;
            nalichie_id: number | null;
            title: string | null;
            post_type: "warehouse" | "consignment" | null;
            origin_profile: "ODN" | "YAN" | null;
          };
          postMeta[entry.id] = {
            nalichie_id: entry.nalichie_id == null ? null : Number(entry.nalichie_id),
            title: entry.title ?? null,
            post_type: entry.post_type ?? "warehouse",
            origin_profile: entry.origin_profile ?? null,
          };
        });
      }

      setPreviewByPost(previews);
      setPostMetaById(postMeta);
      setOrders(orderRows);
    } catch (error) {
      void error;
      setErrorText("Не удалось загрузить список заказов. Попробуйте обновить страницу.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setErrorText(null);
    setSuccessText(null);
    void load(tab);
  }, [tab]);

  const subtitle = useMemo(() => {
    if (tab === "proof") return "Ждут подтверждения";
    if (tab === "expired") return "Истекли";
    if (tab === "confirmed") return "Подтвержденные";
    return "Отклоненные";
  }, [tab]);

  const onOpenProof = async (orderId: string) => {
    try {
      const { url } = await getPaymentProofGetPresign(orderId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setErrorText("Не удалось открыть подтверждение оплаты.");
    }
  };

  const onConfirm = async (order: TgOrder) => {
    setErrorText(null);
    setSuccessText(null);
    setBusyOrderId(order.id);
    try {
      const result = await confirmOrderAndFinalizeShipment(order.id);
      const payment = result.payment;
      const stockMessage = payment.stock_deduction_status === "applied"
        ? " Остаток списан на сервере."
        : " Остаток уже был списан ранее.";
      const paymentMessage = payment.payment_already_confirmed
        ? `Оплата уже была подтверждена ранее. Статус заказа: ${formatOrderStatus(payment.current_status as TgOrder["status"])}.`
        : payment.recorded_to_prodazhi
          ? `Оплата подтверждена. Статус заказа: ${formatOrderStatus(payment.current_status as TgOrder["status"])}.`
          : `Оплата подтверждена без записи в журнал продаж. Статус заказа: ${formatOrderStatus(payment.current_status as TgOrder["status"])}.`;

      if (!result.ok) {
        const shipmentError = String(result.shipment.error ?? "SHIPMENT_CREATE_FAILED");
        setErrorText(getShipmentCreateErrorMessage(shipmentError));
        setSuccessText(`${paymentMessage}${stockMessage}`);
      } else if (result.shipment.status === "existing") {
        setSuccessText(`${paymentMessage}${stockMessage} Отправление уже существует${result.shipment.cdek_track_number ? `, трек ${result.shipment.cdek_track_number}` : ""}.`);
      } else if (result.shipment.status === "created") {
        setSuccessText(`${paymentMessage}${stockMessage} Отправление создано${result.shipment.cdek_track_number ? `, трек ${result.shipment.cdek_track_number}` : ""}.`);
      } else if (result.shipment.status === "in_progress") {
        setSuccessText(`${paymentMessage}${stockMessage} Отправление уже оформляется на сервере. Повторный запуск не выполнялся.`);
      } else {
        setSuccessText(`${paymentMessage}${stockMessage}`);
      }

      await load(tab);
    } catch (error) {
      const details = error as { message?: string; context?: { error?: string; details?: string } } | null;
      const message = String(details?.message ?? "UNKNOWN_ERROR");
      if (message.includes("PAYMENT_CONFIRM_NOT_ALLOWED")) {
        setErrorText("Подтверждение оплаты сейчас недоступно: заказ еще не находится на этапе проверки оплаты.");
      } else if (message.includes("ORDER_STATUS_NOT_CONFIRMABLE")) {
        setErrorText("Этот заказ уже находится в финальном или запрещенном для подтверждения состоянии.");
      } else if (message.includes("STOCK_CONFLICT")) {
        setErrorText("Не удалось подтвердить оплату: товар уже недоступен для безопасного списания остатка.");
      } else if (message.includes("SERVER_ERROR")) {
        setErrorText("Не удалось создать отправление: ошибка сервера. Проверьте данные заказа и попробуйте еще раз.");
      } else {
        setErrorText(getAdminActionErrorMessage("confirm", error));
      }
    } finally {
      setBusyOrderId((current) => (current === order.id ? null : current));
    }
  };

  const onReject = async (orderId: string) => {
    const reason = (rejectReason[orderId] ?? "").trim();
    if (!reason) {
      setErrorText("Укажите причину отклонения.");
      return;
    }
    setErrorText(null);
    setSuccessText(null);
    setBusyOrderId(orderId);
    try {
      await rejectOrderPayment(orderId, reason);
      await load(tab);
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      if (message.includes("ORDER_STATUS_NOT_REJECTABLE")) {
        setErrorText("Этот заказ уже нельзя отклонить из текущего состояния.");
      } else {
        setErrorText("Не удалось отклонить оплату.");
      }
    } finally {
      setBusyOrderId((current) => (current === orderId ? null : current));
    }
  };

  const onRecoverShipmentLock = async (order: TgOrder) => {
    setErrorText(null);
    setSuccessText(null);
    setBusyOrderId(order.id);
    try {
      const result = await recoverStaleShipmentLock(order.id);
      if (result.status === "recovered") {
        setSuccessText("Зависшая блокировка отправления снята. Теперь можно повторить оформление или обновление статуса.");
      } else if (result.status === "not_stale") {
        setErrorText("Блокировка отправления пока не выглядит зависшей. Автоматическое снятие не выполняется.");
      } else if (result.status === "already_created") {
        setSuccessText("Отправление уже создано. Снимать блокировку не нужно.");
      } else if (result.status === "not_locked") {
        setSuccessText("Блокировка отправления уже снята.");
      } else {
        setErrorText("Не удалось снять блокировку отправления.");
      }
      await load(tab);
    } catch (error) {
      setErrorText(getAdminActionErrorMessage("recover_lock", error));
    } finally {
      setBusyOrderId((current) => (current === order.id ? null : current));
    }
  };

  const onSyncShipmentStatus = async (order: TgOrder) => {
    setErrorText(null);
    setSuccessText(null);
    setBusyOrderId(order.id);
    try {
      const result = await syncShipmentStatus(order.id);
      if (result.status === "updated") {
        setSuccessText(`Статус доставки по заказу обновлен${result.cdek_status ? `: ${result.cdek_status}` : ""}${result.cdek_track_number ? `, трек ${result.cdek_track_number}` : ""}.`);
      } else if (result.status === "unchanged") {
        setSuccessText(`Статус доставки по заказу уже актуален${result.cdek_status ? `: ${result.cdek_status}` : ""}${result.cdek_track_number ? `, трек ${result.cdek_track_number}` : ""}.`);
      } else {
        setErrorText("Для этого заказа отправление еще не создано.");
      }
      await load(tab);
    } catch (error) {
      setErrorText(getAdminActionErrorMessage("sync_order", error));
    } finally {
      setBusyOrderId((current) => (current === order.id ? null : current));
    }
  };

  const onCopyTrackNumber = async (trackNumber: string) => {
    try {
      await navigator.clipboard.writeText(trackNumber);
      setSuccessText(`Трек ${trackNumber} скопирован.`);
    } catch (error) {
      setErrorText(getAdminActionErrorMessage("copy_track", error));
    }
  };

  const onSyncAllShipmentStatuses = async () => {
    setErrorText(null);
    setSuccessText(null);
    setIsBatchSyncRunning(true);
    try {
      const result = await syncActiveShipments();
      setSuccessText(formatBatchSyncResult(result));
      if (result.failed > 0) {
        setErrorText("Часть отправлений не удалось обновить. Проверьте проблемные заказы.");
      }
      await load(tab);
    } catch (error) {
      setErrorText(getBatchShipmentSyncErrorMessage(error));
    } finally {
      setIsBatchSyncRunning(false);
    }
  };

  const openConfirmation = (dialog: ConfirmationDialogState) => {
    setConfirmationDialog(dialog);
  };

  const closeConfirmation = () => {
    if (busyOrderId || isBatchSyncRunning) return;
    setConfirmationDialog(null);
  };

  const submitConfirmation = async () => {
    if (!confirmationDialog) return;

    if (confirmationDialog.kind === "confirm_payment") {
      setConfirmationDialog(null);
      await onConfirm(confirmationDialog.order);
      return;
    }

    if (confirmationDialog.kind === "reject_payment") {
      const reason = (rejectReason[confirmationDialog.order.id] ?? "").trim();
      if (!reason) {
        setErrorText("Укажите причину отклонения.");
        return;
      }
      setConfirmationDialog(null);
      await onReject(confirmationDialog.order.id);
      return;
    }

    setConfirmationDialog(null);
    await onSyncAllShipmentStatuses();
  };

  const dialogTitle = confirmationDialog?.kind === "confirm_payment"
    ? "Подтвердить оплату?"
    : confirmationDialog?.kind === "reject_payment"
      ? "Отклонить оплату?"
      : confirmationDialog?.kind === "batch_sync"
        ? "Обновить статусы доставки?"
        : "";

  const dialogText = confirmationDialog?.kind === "confirm_payment"
    ? "После подтверждения заказ станет оплаченным, товар будет списан, а доставка начнет оформляться."
    : confirmationDialog?.kind === "reject_payment"
      ? "Заказ будет отклонен, а товар снова станет доступен в каталоге."
      : confirmationDialog?.kind === "batch_sync"
        ? "Система запросит актуальные статусы по всем активным отправлениям."
        : "";

  const dialogConfirmLabel = confirmationDialog?.kind === "reject_payment" ? "Отклонить" : "Подтвердить";

  return (
    <Page title="Заказы" subtitle={subtitle}>
      <div className="admin-orders-toolbar">
        <Button variant={tab === "proof" ? "primary" : "secondary"} onClick={() => setTab("proof")}>Ждут подтверждения</Button>
        <Button variant={tab === "expired" ? "primary" : "secondary"} onClick={() => setTab("expired")}>Истекли</Button>
        <Button variant={tab === "confirmed" ? "primary" : "secondary"} onClick={() => setTab("confirmed")}>Подтвержденные</Button>
        <Button variant={tab === "rejected" ? "primary" : "secondary"} onClick={() => setTab("rejected")}>Отклоненные</Button>
        <Button variant="secondary" disabled={isBatchSyncRunning || isLoading} onClick={() => openConfirmation({ kind: "batch_sync" })}>
          {isBatchSyncRunning ? "Обновление выполняется..." : "Обновить статусы доставки"}
        </Button>
      </div>

      {isLoading ? <div>Загрузка...</div> : null}
      {errorText ? <div style={{ color: "#b42318" }}>{errorText}</div> : null}
      {successText ? <div style={{ color: "#067647" }}>{successText}</div> : null}

      <div className="admin-orders-grid">
        {orders.map((order) => (
          (() => {
            const orderItems = orderItemsByOrderId[order.id] ?? [];
            const primaryPostId = orderItems[0]?.post_id ?? order.post_id;
            const orderShipments = orderShipmentsByOrderId[order.id] ?? [];
            const originProfiles = orderShipments.length
              ? orderShipments.map((shipment) => shipment.origin_profile)
              : [
                ...new Set(
                  orderItems
                    .map((item) => postMetaById[item.post_id]?.origin_profile)
                    .filter(Boolean) as string[],
                ),
              ];
            if (!originProfiles.length && order.origin_profile) {
              originProfiles.push(order.origin_profile);
            }
            return (
          <AdminOrderCard
            key={order.id}
            order={order}
            orderItems={orderItems}
            orderShipments={orderShipments}
            historyTrackNumbers={historyTrackNumbersByOrderId[order.id] ?? []}
            originLabel={buildOriginLabel(originProfiles)}
            previewUrl={previewByPost[primaryPostId]}
            postMeta={postMetaById[primaryPostId]}
            isBusy={busyOrderId === order.id}
            isExpanded={expandedOrderId === order.id}
            onOpenOrder={(orderId) => setExpandedOrderId((current) => current === orderId ? null : orderId)}
            onOpenProof={onOpenProof}
            onRequestConfirm={(currentOrder) => openConfirmation({ kind: "confirm_payment", order: currentOrder })}
            onRequestReject={(currentOrder) => openConfirmation({ kind: "reject_payment", order: currentOrder })}
            onRecoverShipmentLock={onRecoverShipmentLock}
            onSyncShipmentStatus={onSyncShipmentStatus}
            onCopyTrackNumber={onCopyTrackNumber}
            rejectReason={rejectReason[order.id] ?? ""}
            onRejectReasonChange={(value) => setRejectReason((prev) => ({ ...prev, [order.id]: value }))}
          />
            );
          })()
        ))}
        {!isLoading && !orders.length ? <div style={{ color: "var(--muted)" }}>Список пуст.</div> : null}
      </div>

      {confirmationDialog ? (
        <div className="admin-confirm-overlay" onClick={closeConfirmation}>
          <div className="admin-confirm-dialog glass" onClick={(event) => event.stopPropagation()}>
            <div className="admin-confirm-dialog__title">{dialogTitle}</div>
            <div className="admin-confirm-dialog__text">{dialogText}</div>
            {confirmationDialog.kind === "reject_payment" ? (
              <input
                className="admin-confirm-dialog__input"
                placeholder="Причина отклонения"
                value={rejectReason[confirmationDialog.order.id] ?? ""}
                onChange={(event) => setRejectReason((prev) => ({ ...prev, [confirmationDialog.order.id]: event.target.value }))}
                disabled={Boolean(busyOrderId)}
              />
            ) : null}
            <div className="admin-confirm-dialog__actions">
              <Button variant="secondary" disabled={Boolean(busyOrderId) || isBatchSyncRunning} onClick={closeConfirmation}>Отмена</Button>
              <Button variant="primary" disabled={Boolean(busyOrderId) || isBatchSyncRunning} onClick={() => void submitConfirmation()}>
                {dialogConfirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}

export default AdminOrdersPage;
