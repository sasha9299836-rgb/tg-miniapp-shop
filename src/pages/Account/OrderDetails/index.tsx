import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  isTgIdentityRequiredError,
  TG_IDENTITY_REQUIRED_ERROR,
  TG_IDENTITY_REQUIRED_MESSAGE,
} from "../../../shared/auth/tgUser";
import { getPackagingFeeRub } from "../../../shared/config/packaging";
import {
  formatCdekStatus,
  getCdekTrackingUrl,
} from "../../../shared/lib/shipmentStatus";
import {
  getOrderWithTimeline,
  getShipmentStatusHistory,
  listOrderShipments,
  listOrderItems,
  type ShipmentStatusHistoryEntry,
  type TgOrder,
  type TgOrderItem,
  type TgOrderShipment,
  type TgOrderTimelineEvent,
} from "../../../shared/api/ordersApi";
import { ensureTelegramUserSessionToken } from "../../../shared/auth/tgUserSession";
import {
  getPostById,
  getPostPhotos,
  type TgPost,
  type TgPostPhoto,
} from "../../../shared/api/adminPostsApi";
import { Button } from "../../../shared/ui/Button";
import { Card, CardText, CardTitle } from "../../../shared/ui/Card";
import { Page } from "../../../shared/ui/Page";
import { ProductThumb } from "../../../shared/ui/ProductThumb";
import "./styles.css";

type DeliveryStepState = "completed" | "current" | "pending";

type DeliveryStep = {
  key: string;
  label: string;
};

type DeliveryTimelineEvent = {
  code: string | null;
  name: string | null;
  city: string | null;
  happenedAt: string | null;
};

type ShipmentView = {
  key: string;
  cdekUuid: string | null;
  trackNumber: string;
  itemLabel: string;
};

const MULTI_TRACK_HINT_SEEN_KEY = "multi_track_hint_seen";

const DELIVERY_STEPS: DeliveryStep[] = [
  { key: "registered", label: "Заказ зарегистрирован" },
  { key: "package_prepared", label: "Посылка оформлена" },
  { key: "handover", label: "Передано в доставку" },
  { key: "in_transit", label: "В пути" },
  { key: "arrival_city", label: "Прибыло в город получения" },
  { key: "ready_pickup", label: "Готово к выдаче" },
  { key: "delivered", label: "Получено" },
];

function normalizeStatusText(value?: string | null) {
  return String(value ?? "").trim().toUpperCase();
}

function resolveStepIndexFromStatus(statusCode?: string | null, statusName?: string | null): number | null {
  const code = normalizeStatusText(statusCode);
  const name = normalizeStatusText(statusName);
  const source = `${code} ${name}`.trim();
  if (!source) return null;

  if (source.includes("DELIVERED") || source.includes("ВРУЧЕН") || source.includes("ПОЛУЧЕН")) return 6;
  if (source.includes("READY_FOR_PICKUP") || source.includes("READY") || source.includes("ВЫДАЧ")) return 5;
  if (source.includes("ARRIVED") || source.includes("ARRIVAL") || source.includes("ПРИБЫЛ") || source.includes("ГОРОД ПОЛУЧ")) return 4;
  if (source.includes("IN_TRANSIT") || source.includes("TRANSIT") || source.includes("В ПУТИ")) return 3;
  if (source.includes("HANDOVER") || source.includes("TRANSFER") || source.includes("ПЕРЕДАН")) return 2;
  if (source.includes("ACCEPTED") || source.includes("CREATED") || source.includes("REGISTERED") || source.includes("ОФОРМЛЕН") || source.includes("ЗАРЕГИСТРИР")) return 1;
  if (source.includes("NEW") || source.includes("DRAFT") || source.includes("СОЗДАН")) return 0;

  return null;
}

function formatTimelineDateTime(iso?: string | null) {
  if (!iso) return null;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return null;
  return value.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatOrderStatus(status: TgOrder["status"] | string) {
  switch (status) {
    case "awaiting_payment_proof":
      return "Ожидает оплату";
    case "payment_proof_submitted":
      return "Проверка оплаты";
    case "payment_confirmed":
    case "paid":
      return "Оплата подтверждена";
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

function formatDate(iso?: string | null) {
  if (!iso) return "-";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "-";
  return value.toLocaleDateString("ru-RU");
}

function formatTime(iso?: string | null) {
  if (!iso) return "-";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "-";
  return value.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "-";
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

function getShortOrderNumber(orderId: string): string {
  const compact = orderId.replace(/-/g, "");
  return `#${compact.slice(-6).toUpperCase()}`;
}

function buildPostLabel(post: TgPost | null | undefined, postId: string): string {
  if (!post) return `Товар ${postId.slice(0, 6)}`;
  const title = String(post.title ?? "").trim();
  const brand = String(post.brand ?? "").trim();
  if (!brand) return title || "Товар";
  if (title.toLowerCase().includes(brand.toLowerCase())) return title;
  return `${title} ${brand}`.trim();
}

export function OrderDetailsPage() {
  const nav = useNavigate();
  const params = useParams<{ orderId: string }>();
  const orderId = String(params.orderId ?? "").trim();

  const [order, setOrder] = useState<TgOrder | null>(null);
  const [timeline, setTimeline] = useState<TgOrderTimelineEvent[]>([]);
  const [shipmentHistory, setShipmentHistory] = useState<ShipmentStatusHistoryEntry[]>([]);
  const [orderShipments, setOrderShipments] = useState<TgOrderShipment[]>([]);
  const [orderItems, setOrderItems] = useState<TgOrderItem[]>([]);
  const [postsById, setPostsById] = useState<Record<string, TgPost>>({});
  const [postCoverById, setPostCoverById] = useState<Record<string, string | null>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  const [copyTrackFeedback, setCopyTrackFeedback] = useState<string | null>(null);
  const [isTrackPickerOpen, setIsTrackPickerOpen] = useState(false);
  const [activeShipmentKey, setActiveShipmentKey] = useState<string | null>(null);
  const [hasSeenMultiTrackHint, setHasSeenMultiTrackHint] = useState(false);
  const [isMultiTrackHintModalOpen, setIsMultiTrackHintModalOpen] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setErrorText("Некорректный номер заказа.");
      return;
    }

    const load = async () => {
      setIsLoading(true);
      setErrorText(null);
      try {
        const userSessionToken = await ensureTelegramUserSessionToken();
        if (!userSessionToken) {
          throw new Error(TG_IDENTITY_REQUIRED_ERROR);
        }
        const [result, history, items, shipments] = await Promise.all([
          getOrderWithTimeline(orderId),
          getShipmentStatusHistory(orderId),
          listOrderItems(orderId),
          listOrderShipments(orderId),
        ]);

        setOrder(result.order);
        setTimeline(result.timeline);
        setShipmentHistory(history);
        setOrderItems(items);
        setOrderShipments(shipments);

        const postIds = items.length
          ? items.map((item) => item.post_id)
          : result.order.post_id
            ? [result.order.post_id]
            : [];

        const uniquePostIds = [...new Set(postIds.map((value) => String(value).trim()).filter(Boolean))];
        if (!uniquePostIds.length) {
          setPostsById({});
          setPostCoverById({});
        } else {
          const postEntries = await Promise.all(uniquePostIds.map(async (postId) => {
            try {
              const loadedPost = await getPostById(postId);
              return loadedPost ? ([postId, loadedPost] as const) : null;
            } catch {
              return null;
            }
          }));
          const coverEntries = await Promise.all(uniquePostIds.map(async (postId) => {
            try {
              const loadedPhotos = await getPostPhotos(postId);
              const photos = (loadedPhotos ?? []) as TgPostPhoto[];
              return [postId, photos[0]?.url ?? null] as const;
            } catch {
              return [postId, null] as const;
            }
          }));

          setPostsById(Object.fromEntries(postEntries.filter(Boolean) as Array<readonly [string, TgPost]>));
          setPostCoverById(Object.fromEntries(coverEntries));
        }
      } catch (error) {
        setErrorText(isTgIdentityRequiredError(error) ? TG_IDENTITY_REQUIRED_MESSAGE : "Не удалось загрузить детали заказа.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [orderId]);

  const priceRub = Number(order?.subtotal_with_all_discounts_rub ?? order?.price_rub ?? 0);
  const rawDeliveryFee = Number(order?.delivery_total_fee_rub ?? 0);
  const deliveryDiscountAmount = Number(order?.delivery_discount_amount_rub ?? 0);
  const deliveryFee = Math.max(0, rawDeliveryFee - deliveryDiscountAmount);
  const packagingFee = Number(order?.packaging_fee_rub ?? getPackagingFeeRub(order?.packaging_type));
  const total = Number(order?.final_total_rub ?? (priceRub + deliveryFee + packagingFee));

  const timelineRows = useMemo(
    () => [...timeline].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()),
    [timeline],
  );

  const orderPostIds = useMemo(() => {
    const fromItems = orderItems.map((item) => item.post_id).filter(Boolean);
    if (fromItems.length) return fromItems;
    return order?.post_id ? [order.post_id] : [];
  }, [order?.post_id, orderItems]);

  const shipmentViews = useMemo<ShipmentView[]>(() => {
    const itemPostIds = orderItems.length ? orderItems.map((item) => item.post_id) : (order?.post_id ? [order.post_id] : []);
    const itemLabelByOrigin = new Map<string, string[]>();

    itemPostIds.forEach((postId) => {
      const post = postsById[postId];
      const origin = post?.origin_profile ? String(post.origin_profile) : "";
      if (!origin) return;
      const list = itemLabelByOrigin.get(origin) ?? [];
      list.push(buildPostLabel(post, postId));
      itemLabelByOrigin.set(origin, list);
    });

    const fromShipments = orderShipments
      .filter((shipment) => Boolean(shipment.cdek_track_number))
      .map((shipment, index) => {
        const linkedLabels = itemLabelByOrigin.get(String(shipment.origin_profile ?? "")) ?? [];
        const itemLabel = linkedLabels.length
          ? linkedLabels.join(", ")
          : (orderPostIds[0] ? buildPostLabel(postsById[orderPostIds[0]], orderPostIds[0]) : `Отправление ${index + 1}`);
        return {
          key: shipment.id,
          cdekUuid: shipment.cdek_uuid ?? null,
          trackNumber: String(shipment.cdek_track_number ?? "").trim(),
          itemLabel,
        };
      })
      .filter((entry) => entry.trackNumber);

    if (fromShipments.length) return fromShipments;

    if (order?.cdek_track_number) {
      return [{
        key: "order-track-fallback",
        cdekUuid: order.cdek_uuid ?? null,
        trackNumber: order.cdek_track_number,
        itemLabel: orderPostIds[0] ? buildPostLabel(postsById[orderPostIds[0]], orderPostIds[0]) : "Отправление",
      }];
    }

    return [];
  }, [order?.cdek_track_number, order?.cdek_uuid, order?.post_id, orderItems, orderPostIds, orderShipments, postsById]);

  useEffect(() => {
    if (!shipmentViews.length) {
      setActiveShipmentKey(null);
      return;
    }
    if (!activeShipmentKey || !shipmentViews.some((entry) => entry.key === activeShipmentKey)) {
      setActiveShipmentKey(shipmentViews[0].key);
    }
  }, [activeShipmentKey, shipmentViews]);

  const activeShipment = useMemo(
    () => shipmentViews.find((entry) => entry.key === activeShipmentKey) ?? shipmentViews[0] ?? null,
    [activeShipmentKey, shipmentViews],
  );

  const shipmentHistoryRows = useMemo(() => {
    const rows = shipmentHistory.filter((entry) => entry.order_id === orderId);
    const activeUuid = activeShipment?.cdekUuid ?? null;

    if (activeUuid) {
      const byUuid = rows.filter((entry) => entry.cdek_uuid === activeUuid);
      if (byUuid.length) {
        return byUuid.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }
    }

    return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [activeShipment?.cdekUuid, orderId, shipmentHistory]);

  const deliveryTimelineModel = useMemo(() => {
    const timelineEvents: DeliveryTimelineEvent[] = shipmentHistoryRows
      .map((entry) => ({
        code: entry.status_code ?? entry.cdek_status ?? null,
        name: entry.status_name ?? null,
        city: entry.city ?? null,
        happenedAt: entry.status_datetime ?? entry.status_date_time ?? entry.created_at ?? null,
      }))
      .sort((a, b) => new Date(a.happenedAt ?? 0).getTime() - new Date(b.happenedAt ?? 0).getTime());

    const fallbackShipment = orderShipments.find((shipment) => shipment.id === activeShipment?.key) ?? null;
    const fallbackStatus = fallbackShipment?.cdek_status ?? order?.cdek_status ?? null;
    if (!timelineEvents.length && fallbackStatus) {
      timelineEvents.push({
        code: fallbackStatus,
        name: formatCdekStatus(fallbackStatus),
        city: null,
        happenedAt: fallbackShipment?.updated_at ?? order?.updated_at ?? order?.created_at ?? null,
      });
    }

    const perStepMeta: Record<number, { happenedAt: string | null; city: string | null }> = {};
    const unknownEvents: DeliveryTimelineEvent[] = [];
    let highestReached = -1;

    timelineEvents.forEach((event) => {
      const stepIndex = resolveStepIndexFromStatus(event.code, event.name);
      if (stepIndex == null) {
        if (event.code || event.name) unknownEvents.push(event);
        return;
      }

      highestReached = Math.max(highestReached, stepIndex);
      perStepMeta[stepIndex] = {
        happenedAt: event.happenedAt,
        city: event.city,
      };
    });

    const hasTimelineData = highestReached >= 0;
    const currentStep = hasTimelineData ? highestReached : -1;

    const steps = DELIVERY_STEPS.map((step, index) => {
      let state: DeliveryStepState = "pending";
      if (index < currentStep) state = "completed";
      if (index === currentStep) state = "current";

      return {
        ...step,
        state,
        happenedAt: perStepMeta[index]?.happenedAt ?? null,
        city: perStepMeta[index]?.city ?? null,
      };
    });

    return {
      hasTimelineData,
      steps,
      unknownEvents,
    };
  }, [activeShipment?.key, order?.cdek_status, order?.created_at, order?.updated_at, orderShipments, shipmentHistoryRows]);

  const trackingUrl = getCdekTrackingUrl(activeShipment?.trackNumber ?? "");

  useEffect(() => {
    if (!copyTrackFeedback) return;
    const timeout = window.setTimeout(() => setCopyTrackFeedback(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyTrackFeedback]);

  useEffect(() => {
    try {
      setHasSeenMultiTrackHint(window.localStorage.getItem(MULTI_TRACK_HINT_SEEN_KEY) === "true");
    } catch {
      setHasSeenMultiTrackHint(false);
    }
  }, []);

  const onCopyTrackNumber = async (trackNumber: string) => {
    try {
      await navigator.clipboard.writeText(trackNumber);
      setCopyTrackFeedback("Скопировано");
    } catch {
      setCopyTrackFeedback("Не удалось скопировать");
    }
  };

  const onOpenTracking = () => {
    if (!shipmentViews.length) return;
    if (shipmentViews.length === 1) {
      const url = getCdekTrackingUrl(shipmentViews[0].trackNumber);
      if (url) window.open(url, "_blank");
      return;
    }
    setIsTrackPickerOpen(true);
  };

  const shouldShowMultiTrackHint = shipmentViews.length > 1 && !hasSeenMultiTrackHint;

  const onCloseMultiTrackHintModal = () => {
    setIsMultiTrackHintModalOpen(false);
    setHasSeenMultiTrackHint(true);
    try {
      window.localStorage.setItem(MULTI_TRACK_HINT_SEEN_KEY, "true");
    } catch {
      // ignore
    }
  };

  return (
    <Page>
      <div className="order-details-grid">
        <Card className="ui-card--padded">
          <CardTitle>Детали заказа</CardTitle>
          <CardText>Здесь показаны история заказа и текущее состояние доставки.</CardText>
        </Card>

        {isLoading ? <div>Загрузка...</div> : null}
        {errorText ? <div style={{ color: "#b42318" }}>{errorText}</div> : null}

        {order ? (
          <>
            <Card className="ui-card--padded order-details-card">
              <div className="order-details-section-title">Товары</div>
              {orderPostIds.length ? orderPostIds.map((postId) => {
                const post = postsById[postId] ?? null;
                const postCover = postCoverById[postId] ?? null;
                return post ? (
                  <div key={postId} className="order-details-product">
                    {postCover ? <ProductThumb src={postCover} alt={post.title} className="order-details-product-image" /> : null}
                    <div>
                      <div className="order-details-product-title">{post.title}</div>
                      <div className="order-details-product-meta">{post.brand || "Без бренда"}</div>
                    </div>
                  </div>
                ) : (
                  <div key={postId} style={{ color: "var(--muted)" }}>post_id: {postId}</div>
                );
              }) : <div style={{ color: "var(--muted)" }}>Товары заказа не найдены.</div>}
            </Card>

            <Card className="ui-card--padded order-details-card">
              <div className="order-details-section-title">{shipmentViews.length > 1 ? "Трек-номера CDEK" : "Трек-номер CDEK"}</div>
              {shipmentViews.length ? (
                <div className="order-details-timeline">
                  {shipmentViews.map((entry) => (
                    <div key={entry.key} className="order-details-timeline-item">
                      <div className="order-details-track-row">
                        <div className="order-details-timeline-status">{entry.itemLabel} - {entry.trackNumber}</div>
                        {shipmentViews.length === 1 ? (
                          <button
                            type="button"
                            className="order-details-copy-button"
                            onClick={() => void onCopyTrackNumber(entry.trackNumber)}
                          >
                            Копировать
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: "var(--muted)" }}>Трек-номер пока не назначен.</div>
              )}
              {copyTrackFeedback ? <div className="order-details-copy-feedback">{copyTrackFeedback}</div> : null}
              {shouldShowMultiTrackHint ? (
                <button
                  type="button"
                  className="order-details-multi-track-hint"
                  onClick={() => setIsMultiTrackHintModalOpen(true)}
                >
                  Почему 2 трек-номера?
                </button>
              ) : null}
              {trackingUrl ? (
                <div className="order-details-actions">
                  <Button variant="secondary" onClick={onOpenTracking}>Отследить на сайте СДЭК</Button>
                </div>
              ) : null}
            </Card>

            <Card className="ui-card--padded order-details-card">
              <div className="order-details-section-title">История доставки CDEK</div>
              {shipmentViews.length > 1 ? (
                <div className="order-delivery-selector">
                  {shipmentViews.map((entry) => (
                    <button
                      key={`selector-${entry.key}`}
                      type="button"
                      className={`order-delivery-selector__btn${activeShipment?.key === entry.key ? " is-active" : ""}`}
                      onClick={() => setActiveShipmentKey(entry.key)}
                    >
                      {entry.itemLabel}
                    </button>
                  ))}
                </div>
              ) : null}
              {deliveryTimelineModel.hasTimelineData ? (
                <div className="order-delivery-timeline">
                  {deliveryTimelineModel.steps.map((step, index) => (
                    <div key={step.key} className={`order-delivery-row order-delivery-row--${step.state}`}>
                      <div className="order-delivery-rail">
                        {index > 0 ? (
                          <div className={`order-delivery-line order-delivery-line--top order-delivery-line--${step.state}`} />
                        ) : (
                          <div className="order-delivery-line order-delivery-line--top order-delivery-line--spacer" />
                        )}
                        <div className={`order-delivery-dot order-delivery-dot--${step.state}`}>
                          {step.state === "completed" ? (
                            <svg
                              viewBox="0 0 16 16"
                              className="order-delivery-dot-check"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425z" />
                            </svg>
                          ) : step.state === "current" ? (
                            <span className="order-delivery-dot-core" />
                          ) : null}
                        </div>
                        {index < deliveryTimelineModel.steps.length - 1 ? (
                          <div className={`order-delivery-line order-delivery-line--bottom order-delivery-line--${step.state}`} />
                        ) : (
                          <div className="order-delivery-line order-delivery-line--bottom order-delivery-line--spacer" />
                        )}
                      </div>
                      <div className="order-delivery-card">
                        <div className="order-delivery-card-label">{step.label}</div>
                        {step.happenedAt ? (
                          <div className="order-delivery-card-meta">{formatTimelineDateTime(step.happenedAt)}</div>
                        ) : null}
                        {step.city ? (
                          <div className="order-delivery-card-city">{step.city}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="order-delivery-timeline-empty">Статусы доставки появятся после обработки отправления</div>
              )}
              {deliveryTimelineModel.unknownEvents.length ? (
                <div className="order-delivery-timeline-unknown">
                  {deliveryTimelineModel.unknownEvents.map((event, index) => (
                    <div key={`${event.code ?? "unknown"}-${event.happenedAt ?? "na"}-${index}`} className="order-delivery-timeline-unknown-item">
                      <div className="order-delivery-timeline-unknown-label">
                        {event.name || formatCdekStatus(event.code)}
                      </div>
                      {event.happenedAt ? (
                        <div className="order-delivery-timeline-unknown-time">{formatTimelineDateTime(event.happenedAt)}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>

            <Card className="ui-card--padded order-details-card">
              <button type="button" className="order-details-toggle" onClick={() => setIsDetailsOpen((prev) => !prev)}>
                <span>Детали заказа</span>
                <span>{isDetailsOpen ? "▾" : "▸"}</span>
              </button>

              {isDetailsOpen ? (
                <>
                  <div className="order-details-row"><span>Номер заказа</span><span>{getShortOrderNumber(order.id)}</span></div>
                  <div className="order-details-row"><span>Создан</span><span>{formatDateTime(order.created_at)}</span></div>
                  <div className="order-details-row"><span>Статус оплаты</span><span>{formatOrderStatus(order.status)}</span></div>
                  <div className="order-details-row"><span>Товаров в заказе</span><span>{orderPostIds.length || 1}</span></div>
                  <div className="order-details-row"><span>Сумма товара</span><span>{priceRub.toLocaleString("ru-RU")} ₽</span></div>
                  <div className="order-details-row"><span>Доставка</span><span>{deliveryFee.toLocaleString("ru-RU")} ₽</span></div>
                  {packagingFee > 0 ? (
                    <div className="order-details-row"><span>Коробка</span><span>{packagingFee.toLocaleString("ru-RU")} ₽</span></div>
                  ) : null}
                  <div className="order-details-row"><span>Итого</span><span>{total.toLocaleString("ru-RU")} ₽</span></div>
                  <div className="order-details-row"><span>Оплата</span><span>Перевод</span></div>
                  <div className="order-details-row"><span>Подтверждение оплаты</span><span>{order.payment_proof_key ? "Загружено" : "Не загружено"}</span></div>
                  {order.reserved_until ? (
                    <div className="order-details-row"><span>Резерв до</span><span>{formatDateTime(order.reserved_until)}</span></div>
                  ) : null}
                </>
              ) : null}
            </Card>

            <Card className="ui-card--padded order-details-card">
              <button type="button" className="order-details-toggle" onClick={() => setIsOrderHistoryOpen((prev) => !prev)}>
                <span>История статусов заказа</span>
                <span>{isOrderHistoryOpen ? "▾" : "▸"}</span>
              </button>

              {isOrderHistoryOpen ? (
                timelineRows.length ? (
                  <div className="order-details-timeline">
                    {timelineRows.map((event) => (
                      <div key={`${event.status}-${event.changed_at}-${event.source}`} className="order-details-timeline-item">
                        <div className="order-details-timeline-status">{formatOrderStatus(event.status)}</div>
                        <div className="order-details-timeline-time">{formatDateTime(event.changed_at)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: "var(--muted)" }}>События по заказу пока отсутствуют.</div>
                )
              ) : null}
            </Card>
          </>
        ) : null}

        {isTrackPickerOpen ? (
          <div className="order-track-picker-overlay" onClick={() => setIsTrackPickerOpen(false)}>
            <div className="order-track-picker-dialog" onClick={(event) => event.stopPropagation()}>
              <div className="order-track-picker-dialog__title">Выберите отправление</div>
              <div className="order-track-picker-dialog__list">
                {shipmentViews.map((entry) => (
                  <button
                    key={`picker-${entry.key}`}
                    type="button"
                    className="order-track-picker-dialog__item"
                    onClick={() => {
                      setIsTrackPickerOpen(false);
                      const url = getCdekTrackingUrl(entry.trackNumber);
                      if (url) window.open(url, "_blank");
                    }}
                  >
                    {entry.itemLabel} - {entry.trackNumber}
                  </button>
                ))}
              </div>
              <Button variant="secondary" onClick={() => setIsTrackPickerOpen(false)}>Закрыть</Button>
            </div>
          </div>
        ) : null}

        {isMultiTrackHintModalOpen ? (
          <div className="order-track-picker-overlay" onClick={onCloseMultiTrackHintModal}>
            <div className="order-track-picker-dialog" onClick={(event) => event.stopPropagation()}>
              <div className="order-track-picker-dialog__title">Почему 2 трек-номера?</div>
              <div className="order-track-picker-dialog__text">
                Наличие двух трек-номеров обусловлено тем, что позиции заказа комплектуются и отгружаются с разных складов (в разных городах). Каждое отправление имеет собственный трек-номер для отслеживания.
              </div>
              <Button variant="secondary" onClick={onCloseMultiTrackHintModal}>ОК</Button>
            </div>
          </div>
        ) : null}

        <Button variant="secondary" onClick={() => nav("/account/orders")}>
          Назад к заказам
        </Button>
      </div>
    </Page>
  );
}

export default OrderDetailsPage;
