import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentTgUserId } from "../../../shared/auth/tgUser";
import {
  listOrderItemsByOrderIds,
  listOrdersByUser,
  listOrderShipmentsByOrderIds,
  type TgOrder,
  type TgOrderItem,
  type TgOrderShipment,
} from "../../../shared/api/ordersApi";
import { supabase } from "../../../shared/api/supabaseClient";
import { getPackagingFeeRub } from "../../../shared/config/packaging";
import { getCdekTrackingUrl, getUnifiedOrderStatus } from "../../../shared/lib/shipmentStatus";
import { Button } from "../../../shared/ui/Button";
import { Card, CardText, CardTitle } from "../../../shared/ui/Card";
import { ListItem } from "../../../shared/ui/ListItem";
import { Page } from "../../../shared/ui/Page";
import "./styles.css";

function formatDateTimeNoSeconds(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "-";
  return value.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatOriginProfileLabel(originProfile: string): string {
  if (originProfile === "ODN") return "Одинцово";
  if (originProfile === "YAN") return "Янино";
  return originProfile;
}

function getItemsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "товара";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "товаров";
  return "товаров";
}

function inferTypeFromTitle(title: string): string | null {
  const normalized = String(title ?? "").trim();
  if (!normalized) return null;
  const firstWord = normalized.split(/\s+/)[0] ?? "";
  const cleaned = firstWord.replace(/[^\p{L}\p{N}-]/gu, "").trim();
  return cleaned ? cleaned.toLowerCase() : null;
}

export function OrdersPage() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<TgOrder[]>([]);
  const [orderItemsByOrderId, setOrderItemsByOrderId] = useState<Record<string, TgOrderItem[]>>({});
  const [shipmentsByOrderId, setShipmentsByOrderId] = useState<Record<string, TgOrderShipment[]>>({});
  const [postsById, setPostsById] = useState<Record<string, { title: string; brand: string | null }>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setErrorText(null);
      try {
        const tgUserId = getCurrentTgUserId();
        const rows = await listOrdersByUser(tgUserId);
        const orderIds = rows.map((row) => row.id);
        const [shipments, orderItems] = await Promise.all([
          listOrderShipmentsByOrderIds(orderIds),
          listOrderItemsByOrderIds(orderIds),
        ]);
        const grouped = shipments.reduce<Record<string, TgOrderShipment[]>>((acc, shipment) => {
          if (!acc[shipment.order_id]) acc[shipment.order_id] = [];
          acc[shipment.order_id].push(shipment);
          return acc;
        }, {});
        const groupedItems = orderItems.reduce<Record<string, TgOrderItem[]>>((acc, item) => {
          if (!acc[item.order_id]) acc[item.order_id] = [];
          acc[item.order_id].push(item);
          return acc;
        }, {});

        const postIds = [...new Set(orderItems.map((item) => String(item.post_id ?? "").trim()).filter(Boolean))];
        const postsMap: Record<string, { title: string; brand: string | null }> = {};
        if (postIds.length) {
          const { data: posts, error: postsError } = await supabase
            .from("tg_posts")
            .select("id, title, brand")
            .in("id", postIds);
          if (postsError) throw postsError;
          (posts ?? []).forEach((row) => {
            const post = row as { id: string; title: string; brand: string | null };
            postsMap[post.id] = {
              title: String(post.title ?? "").trim(),
              brand: post.brand ? String(post.brand).trim() : null,
            };
          });
        }
        setOrders(rows);
        setOrderItemsByOrderId(groupedItems);
        setShipmentsByOrderId(grouped);
        setPostsById(postsMap);
      } catch {
        setErrorText("Не удалось загрузить заказы.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <Page>
      <div className="orders-grid">
        <Card className="ui-card--padded orders-hero">
          <CardTitle>Заказы</CardTitle>
          <CardText>Здесь показаны ваши заказы и текущий статус по каждому из них.</CardText>
        </Card>

        {isLoading ? <div>Загрузка...</div> : null}

        <div className="orders-list">
          {orders.map((order, idx) => {
            const totalRub =
              (order.price_rub ?? 0) + (order.delivery_total_fee_rub ?? 0) + getPackagingFeeRub(order.packaging_type);
            const orderItems = orderItemsByOrderId[order.id] ?? [];
            const unifiedStatus = getUnifiedOrderStatus({
              orderStatus: order.status,
              cdekUuid: order.cdek_uuid,
              cdekStatus: order.cdek_status,
              cdekTrackNumber: order.cdek_track_number,
            });
            const trackingUrl = getCdekTrackingUrl(order.cdek_track_number);
            const orderShipments = shipmentsByOrderId[order.id] ?? [];
            const shipmentTracks = orderShipments
              .filter((shipment) => shipment.cdek_track_number)
              .map((shipment) => ({
                originLabel: formatOriginProfileLabel(shipment.origin_profile),
                trackNumber: shipment.cdek_track_number as string,
              }));
            const trackSubtitleLines = shipmentTracks.length > 1
              ? ["Трек-номера:", ...shipmentTracks.map((track) => `${track.originLabel}: ${track.trackNumber}`)]
              : shipmentTracks.length === 1
                ? [`Трек-номер: ${shipmentTracks[0].trackNumber}`]
                : order.cdek_track_number
                  ? [`Трек-номер: ${order.cdek_track_number}`]
                  : [];

            const itemCount = orderItems.length || 1;
            const primaryPostId = orderItems[0]?.post_id ?? order.post_id;
            const primaryPost = primaryPostId ? postsById[primaryPostId] : null;
            const primaryTitle = primaryPost?.title ?? "";
            const primaryBrand = primaryPost?.brand ?? null;
            const inferredType = inferTypeFromTitle(primaryTitle);
            const brandInTitle = primaryBrand ? primaryTitle.toLowerCase().includes(primaryBrand.toLowerCase()) : false;
            const orderTitle = itemCount > 1
              ? `Заказ из ${itemCount} ${getItemsWord(itemCount)}`
              : primaryTitle
                ? brandInTitle
                  ? `Заказ ${primaryTitle}`
                  : `Заказ ${inferredType ?? primaryTitle}${primaryBrand ? ` ${primaryBrand}` : ""}`
                : "Заказ товара";

            return (
              <div key={order.id} className="orders-list-item">
                <ListItem
                  title={orderTitle}
                  subtitle={[
                    `Сумма: ${totalRub.toLocaleString("ru-RU")} ₽ • ${formatDateTimeNoSeconds(order.created_at)}`,
                    `Статус заказа: ${unifiedStatus.shortLabel}`,
                    ...trackSubtitleLines,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                  right={(
                    <div className="orders-right">
                      <span className={`orders-pill orders-pill--${unifiedStatus.tone}`}>{unifiedStatus.shortLabel}</span>
                      <button
                        type="button"
                        className="orders-open-button"
                        onClick={() => nav(`/orders/${order.id}`)}
                      >
                        Открыть
                      </button>
                    </div>
                  )}
                  chevron={false}
                  divider={idx !== orders.length - 1}
                  position={idx === 0 ? "first" : idx === orders.length - 1 ? "last" : "middle"}
                />
                {trackingUrl ? (
                  <div className="orders-list-item__actions">
                    <Button variant="secondary" onClick={() => window.open(trackingUrl, "_blank")}>
                      Отследить
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}

          {!isLoading && orders.length === 0 ? <div style={{ color: "var(--muted)" }}>Заказов пока нет.</div> : null}
        </div>

        {errorText ? <div style={{ color: "#b42318" }}>{errorText}</div> : null}

        <Button variant="secondary" onClick={() => nav(-1)}>
          Назад
        </Button>
      </div>
    </Page>
  );
}

export default OrdersPage;
