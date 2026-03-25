import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "../../shared/ui/Page";
import { Button } from "../../shared/ui/Button";
import { Card, CardText, CardTitle } from "../../shared/ui/Card";
import { useAdminStore } from "../../entities/account/model/useAdminStore";
import {
  getAdminAnalytics,
  type AdminAnalyticsListItem,
  type AdminAnalyticsRange,
  type AdminAnalyticsSnapshot,
} from "../../shared/api/ordersApi";
import { getAdminAnalyticsErrorMessage } from "../../shared/lib/adminErrors";
import { formatCdekStatus } from "../../shared/lib/shipmentStatus";

const RANGE_OPTIONS: Array<{ value: AdminAnalyticsRange; label: string }> = [
  { value: "today", label: "Сегодня" },
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "all", label: "За всё время" },
];

function formatMoney(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function formatOrderStatus(status: string | null) {
  switch (status) {
    case "awaiting_payment_proof":
    case "created":
      return "Ожидает оплату";
    case "payment_proof_submitted":
      return "Ждет проверки оплаты";
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
      return "Просрочен";
    case "cancelled":
      return "Отменен";
    default:
      return status || "—";
  }
}

function parseErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const maybeStatus = (error as { context?: { status?: number }; status?: number }).context?.status ??
    (error as { status?: number }).status;
  return typeof maybeStatus === "number" ? maybeStatus : null;
}

function ListBlock(props: {
  title: string;
  items: AdminAnalyticsListItem[];
  emptyText: string;
  highlightShipment?: boolean;
}) {
  const { title, items, emptyText, highlightShipment = false } = props;

  return (
    <Card className="ui-card--padded">
      <CardTitle>{title}</CardTitle>
      {!items.length ? <CardText>{emptyText}</CardText> : null}
      {items.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item) => (
            <div
              key={`${title}-${item.order_id}`}
              style={{
                display: "grid",
                gap: 4,
                padding: "10px 0",
                borderBottom: "1px solid rgba(0,0,0,0.08)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <strong>Заказ {item.order_id.slice(0, 8)}</strong>
                <span>{formatMoney(Number(item.price_rub ?? 0))}</span>
              </div>
              <div style={{ color: "var(--muted)" }}>
                {item.fio || "Без имени"} · {formatOrderStatus(item.status)}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Создан: {formatDateTime(item.created_at)}
              </div>
              {item.payment_confirmed_at ? (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  Оплата подтверждена: {formatDateTime(item.payment_confirmed_at)}
                </div>
              ) : null}
              {highlightShipment && (item.cdek_status || item.cdek_track_number) ? (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  {item.cdek_status ? formatCdekStatus(item.cdek_status) : "Shipment создан"}
                  {item.cdek_track_number ? ` · Трек ${item.cdek_track_number}` : ""}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export function AdminHome() {
  const nav = useNavigate();
  const { clearAdmin } = useAdminStore();
  const [range, setRange] = useState<AdminAnalyticsRange>("7d");
  const [analytics, setAnalytics] = useState<AdminAnalyticsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const onLogout = () => {
    clearAdmin();
    nav("/account");
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setErrorText(null);
      try {
        const snapshot = await getAdminAnalytics(range);
        if (!cancelled) {
          setAnalytics(snapshot);
        }
      } catch (error) {
        if (!cancelled) {
          const status = parseErrorStatus(error);
          if (status === 401) {
            clearAdmin();
            nav("/account", { replace: true });
            return;
          }
          setErrorText(getAdminAnalyticsErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const summary = analytics?.summary;
  const generatedAt = useMemo(() => formatDateTime(analytics?.generated_at ?? null), [analytics?.generated_at]);

  return (
    <Page title="Админка" subtitle="Продажи, заказы и операционная сводка">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="secondary" onClick={() => nav("/admin/posts/new")}>Новый пост</Button>
        <Button variant="secondary" onClick={() => nav("/admin/posts/scheduled")}>Черновики и отложенные</Button>
        <Button variant="secondary" onClick={() => nav("/admin/orders")}>Заказы</Button>
        <Button variant="secondary" onClick={onLogout}>Выйти из админки</Button>
      </div>

      <Card className="ui-card--padded">
        <CardTitle>Аналитика продаж</CardTitle>
        <CardText>Сводка по подтвержденным продажам и текущему состоянию заказов. Обновлено: {generatedAt}</CardText>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={range === option.value ? "primary" : "secondary"}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </Card>

      {isLoading ? <div>Загрузка аналитики...</div> : null}
      {errorText ? <div style={{ color: "#b42318" }}>Не удалось загрузить аналитику: {errorText}</div> : null}

      {summary ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Card className="ui-card--padded">
            <CardTitle>Выручка</CardTitle>
            <CardText>{formatMoney(summary.total_revenue_rub)}</CardText>
          </Card>
          <Card className="ui-card--padded">
            <CardTitle>Оплаченные</CardTitle>
            <CardText>{summary.paid_orders_count}</CardText>
          </Card>
          <Card className="ui-card--padded">
            <CardTitle>Завершенные</CardTitle>
            <CardText>{summary.completed_orders_count}</CardText>
          </Card>
          <Card className="ui-card--padded">
            <CardTitle>Готовы к выдаче</CardTitle>
            <CardText>{summary.ready_for_pickup_count}</CardText>
          </Card>
          <Card className="ui-card--padded">
            <CardTitle>Активная доставка</CardTitle>
            <CardText>{summary.active_deliveries_count}</CardText>
          </Card>
          <Card className="ui-card--padded">
            <CardTitle>Ждут проверки</CardTitle>
            <CardText>{summary.awaiting_payment_review_count}</CardText>
          </Card>
          <Card className="ui-card--padded">
            <CardTitle>Отклонены / истекли</CardTitle>
            <CardText>{summary.rejected_or_expired_count}</CardText>
          </Card>
        </div>
      ) : null}

      {analytics ? (
        <div style={{ display: "grid", gap: 12 }}>
          <ListBlock
            title="Последние оплаченные заказы"
            items={analytics.lists.latest_paid_orders}
            emptyText="За выбранный период подтвержденных заказов нет."
            highlightShipment
          />
          <ListBlock
            title="Ждут подтверждения оплаты"
            items={analytics.lists.awaiting_payment_review_orders}
            emptyText="Сейчас нет заказов, ожидающих проверку."
          />
          <ListBlock
            title="Готовы к выдаче"
            items={analytics.lists.ready_for_pickup_orders}
            emptyText="Сейчас нет заказов, готовых к выдаче."
            highlightShipment
          />
          <ListBlock
            title="Проблемные заказы"
            items={analytics.lists.problem_orders}
            emptyText="Проблемных заказов сейчас нет."
            highlightShipment
          />
        </div>
      ) : null}
    </Page>
  );
}

export default AdminHome;
