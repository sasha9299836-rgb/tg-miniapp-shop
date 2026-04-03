import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCurrentTgUserId } from "../../../shared/auth/tgUser";
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
import {
  getPostById,
  getPostPhotos,
  type TgPost,
  type TgPostPhoto,
} from "../../../shared/api/adminPostsApi";
import { Button } from "../../../shared/ui/Button";
import { Card, CardText, CardTitle } from "../../../shared/ui/Card";
import { Page } from "../../../shared/ui/Page";
import "./styles.css";

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

function formatOriginProfileLabel(originProfile: string): string {
  if (originProfile === "ODN") return "Одинцово";
  if (originProfile === "YAN") return "Янино";
  return originProfile;
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

  useEffect(() => {
    if (!orderId) {
      setErrorText("Некорректный номер заказа.");
      return;
    }

    const tgUserId = getCurrentTgUserId();
    const load = async () => {
      setIsLoading(true);
      setErrorText(null);
      try {
        const [result, history, items, shipments] = await Promise.all([
          getOrderWithTimeline(orderId, tgUserId),
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
      } catch {
        setErrorText("Не удалось загрузить детали заказа.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [orderId]);

  const priceRub = Number(order?.price_rub ?? 0);
  const deliveryFee = Number(order?.delivery_total_fee_rub ?? 0);
  const packagingFee = Number(order?.packaging_fee_rub ?? getPackagingFeeRub(order?.packaging_type));
  const total = priceRub + deliveryFee + packagingFee;

  const timelineRows = useMemo(
    () => [...timeline].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()),
    [timeline],
  );

  const orderPostIds = useMemo(() => {
    const fromItems = orderItems.map((item) => item.post_id).filter(Boolean);
    if (fromItems.length) return fromItems;
    return order?.post_id ? [order.post_id] : [];
  }, [order?.post_id, orderItems]);

  const shipmentHistoryRows = useMemo(() => {
    const filtered = shipmentHistory.filter((entry) => entry.order_id === orderId);
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (order?.cdek_uuid) {
      const sameUuid = filtered.filter((entry) => entry.cdek_uuid === order.cdek_uuid);
      return sameUuid.length ? sameUuid : filtered;
    }
    return filtered;
  }, [shipmentHistory, order?.cdek_uuid, orderId]);

  const shipmentTracks = orderShipments
    .filter((shipment) => shipment.cdek_track_number)
    .map((shipment) => ({
      label: formatOriginProfileLabel(shipment.origin_profile),
      trackNumber: shipment.cdek_track_number as string,
    }));
  const trackLines = shipmentTracks.length > 1
    ? shipmentTracks.map((track) => `${track.label}: ${track.trackNumber}`)
    : shipmentTracks.length === 1
      ? [shipmentTracks[0].trackNumber]
      : order?.cdek_track_number
        ? [order.cdek_track_number]
        : [];
  const trackingUrl = getCdekTrackingUrl(trackLines[0]);

  useEffect(() => {
    if (!copyTrackFeedback) return;
    const timeout = window.setTimeout(() => setCopyTrackFeedback(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyTrackFeedback]);

  const onCopyTrackNumber = async (trackNumber: string) => {
    try {
      await navigator.clipboard.writeText(trackNumber);
      setCopyTrackFeedback("Скопировано");
    } catch {
      setCopyTrackFeedback("Не удалось скопировать");
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
                    {postCover ? <img src={postCover} alt={post.title} className="order-details-product-image" /> : null}
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
              <div className="order-details-section-title">{trackLines.length > 1 ? "Трек-номера CDEK" : "Трек-номер CDEK"}</div>
              {trackLines.length ? (
                <div className="order-details-timeline">
                  {trackLines.map((line) => (
                    <div key={line} className="order-details-timeline-item">
                      <div className="order-details-track-row">
                        <div className="order-details-timeline-status">{line}</div>
                        {trackLines.length === 1 ? (
                          <button
                            type="button"
                            className="order-details-copy-button"
                            onClick={() => void onCopyTrackNumber(line)}
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
              {trackingUrl ? (
                <div className="order-details-actions">
                  <Button variant="secondary" onClick={() => window.open(trackingUrl, "_blank")}>Отследить на сайте СДЭК</Button>
                </div>
              ) : null}
            </Card>

            <Card className="ui-card--padded order-details-card">
              <div className="order-details-section-title">История доставки CDEK</div>
              {shipmentHistoryRows.length ? (
                <div className="order-details-timeline">
                  {shipmentHistoryRows.map((entry) => (
                    <div key={entry.id} className="order-details-timeline-item">
                      <div className="order-details-timeline-status">{formatCdekStatus(entry.cdek_status)}</div>
                      <div className="order-details-timeline-time">{formatDateTime(entry.created_at)}</div>
                    </div>
                  ))}
                </div>
              ) : order.cdek_status ? (
                <div className="order-details-timeline">
                  <div className="order-details-timeline-item">
                    <div className="order-details-timeline-status">{formatCdekStatus(order.cdek_status)}</div>
                    <div className="order-details-timeline-time">Текущий статус</div>
                  </div>
                </div>
              ) : (
                <div style={{ color: "var(--muted)" }}>Отправление еще не создано или история пока пуста.</div>
              )}
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

        <Button variant="secondary" onClick={() => nav("/account/orders")}>
          Назад к заказам
        </Button>
      </div>
    </Page>
  );
}

export default OrderDetailsPage;
