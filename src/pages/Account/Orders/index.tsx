import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentTgUserId } from "../../../shared/auth/tgUser";
import { listOrdersByUser, listOrderShipmentsByOrderIds, type TgOrder, type TgOrderShipment } from "../../../shared/api/ordersApi";
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

export function OrdersPage() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<TgOrder[]>([]);
  const [shipmentsByOrderId, setShipmentsByOrderId] = useState<Record<string, TgOrderShipment[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setErrorText(null);
      try {
        const tgUserId = getCurrentTgUserId();
        const rows = await listOrdersByUser(tgUserId);
        const shipments = await listOrderShipmentsByOrderIds(rows.map((row) => row.id));
        const grouped = shipments.reduce<Record<string, TgOrderShipment[]>>((acc, shipment) => {
          if (!acc[shipment.order_id]) acc[shipment.order_id] = [];
          acc[shipment.order_id].push(shipment);
          return acc;
        }, {});
        setOrders(rows);
        setShipmentsByOrderId(grouped);
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

            return (
              <div key={order.id} className="orders-list-item">
                <ListItem
                  title={`Заказ ${order.id.slice(0, 8)}`}
                  subtitle={[
                    `Сумма: ${totalRub.toLocaleString("ru-RU")} ₽ • ${formatDateTimeNoSeconds(order.created_at)}`,
                    `Статус заказа: ${unifiedStatus.shortLabel}`,
                    ...trackSubtitleLines,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                  right={
                    <span className={`orders-pill orders-pill--${unifiedStatus.tone}`}>{unifiedStatus.shortLabel}</span>
                  }
                  onClick={() => nav(`/orders/${order.id}`)}
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
