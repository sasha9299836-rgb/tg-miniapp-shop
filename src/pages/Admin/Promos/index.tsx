import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { Page } from "../../../shared/ui/Page";
import {
  deleteAdminPromo,
  getAdminPromoDetail,
  listAdminPromos,
  setAdminPromoStatus,
  upsertAdminPromo,
  type AdminPromoDetail,
  type AdminPromoListItem,
  type PromoStatus,
  type PromoType,
} from "../../../shared/api/adminPromoApi";
import "./styles.css";

function rub(value: number) {
  return `${Number(value ?? 0).toLocaleString("ru-RU")} ₽`;
}

function toLocalDatetimeValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function fromLocalDatetimeValue(value: string): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

export function AdminPromosPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<AdminPromoListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminPromoDetail | null>(null);
  const [code, setCode] = useState("");
  const [type, setType] = useState<PromoType>("single_use");
  const [discountPercent, setDiscountPercent] = useState("10");
  const [status, setStatus] = useState<PromoStatus>("active");
  const [expiresAt, setExpiresAt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const loadList = async () => {
    setIsLoading(true);
    setErrorText(null);
    try {
      const list = await listAdminPromos();
      setItems(list);
      if (selectedId && !list.some((row) => row.id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (error) {
      setErrorText(`Не удалось загрузить промокоды: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    try {
      const next = await getAdminPromoDetail(id);
      setDetail(next);
    } catch (error) {
      setDetail(null);
      setErrorText(`Не удалось загрузить статистику: ${(error as Error).message}`);
    }
  };

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadDetail(selectedId);
  }, [selectedId]);

  const onSelectPromo = (promo: AdminPromoListItem) => {
    setSelectedId(promo.id);
    setCode(promo.code);
    setType(promo.type);
    setDiscountPercent(String(promo.discount_percent));
    setStatus(promo.status);
    setExpiresAt(toLocalDatetimeValue(promo.expires_at));
    setSuccessText(null);
    setErrorText(null);
  };

  const onResetForm = () => {
    setSelectedId(null);
    setDetail(null);
    setCode("");
    setType("single_use");
    setDiscountPercent("10");
    setStatus("active");
    setExpiresAt("");
    setSuccessText(null);
    setErrorText(null);
  };

  const onSave = async () => {
    const normalizedCode = code.trim();
    const percent = Number(discountPercent);
    if (!normalizedCode) {
      setErrorText("Введите код промокода.");
      return;
    }
    if (!Number.isFinite(percent) || percent <= 0 || percent > 95) {
      setErrorText("Процент скидки должен быть от 1 до 95.");
      return;
    }

    let confirmHighDiscount = true;
    if (percent > 15) {
      confirmHighDiscount = window.confirm("Скидка больше 15%. Вы точно уверены?");
      if (!confirmHighDiscount) return;
    }

    setIsSaving(true);
    setErrorText(null);
    setSuccessText(null);
    try {
      const saved = await upsertAdminPromo({
        id: selectedId,
        code: normalizedCode,
        type,
        discount_percent: percent,
        status,
        expires_at: fromLocalDatetimeValue(expiresAt),
        confirm_high_discount: confirmHighDiscount,
      });
      await loadList();
      setSelectedId(saved.id);
      await loadDetail(saved.id);
      setSuccessText(selectedId ? "Промокод обновлён." : "Промокод создан.");
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("PROMO_DISCOUNT_CONFIRM_REQUIRED")) {
        setErrorText("Для скидки больше 15% нужно подтверждение.");
      } else if (message.includes("PROMO_CODE_EXISTS")) {
        setErrorText("Промокод с таким кодом уже существует.");
      } else {
        setErrorText(`Не удалось сохранить промокод: ${message}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = async () => {
    if (!selectedId || isDeleting) return;
    const confirmed = window.confirm("Удалить промокод?");
    if (!confirmed) return;
    setIsDeleting(true);
    setErrorText(null);
    setSuccessText(null);
    try {
      await deleteAdminPromo(selectedId);
      await loadList();
      onResetForm();
      setSuccessText("Промокод удалён.");
    } catch (error) {
      setErrorText(`Не удалось удалить промокод: ${(error as Error).message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const onQuickStatus = async (id: string, nextStatus: PromoStatus) => {
    setErrorText(null);
    setSuccessText(null);
    try {
      await setAdminPromoStatus(id, nextStatus);
      await loadList();
      if (selectedId === id) {
        setStatus(nextStatus);
        await loadDetail(id);
      }
      setSuccessText("Статус обновлён.");
    } catch (error) {
      setErrorText(`Не удалось изменить статус: ${(error as Error).message}`);
    }
  };

  return (
    <Page title="Промокоды" subtitle="Управление кодами и статистикой подтверждённых заказов">
      <div className="admin-promos-page">
        <div className="admin-promos-page__layout">
          <div className="glass admin-promos-page__list">
            <div className="admin-promos-page__section-title">Список промокодов</div>
            {isLoading ? <div className="admin-promos-page__muted">Загрузка...</div> : null}
            {!isLoading && !items.length ? <div className="admin-promos-page__muted">Промокодов пока нет.</div> : null}
            {items.map((item) => (
              <div
                key={item.id}
                className={`admin-promos-page__item ${item.id === selectedId ? "is-active" : ""}`}
                onClick={() => onSelectPromo(item)}
              >
                <div className="admin-promos-page__item-top">
                  <div className="admin-promos-page__code">{item.code}</div>
                  <div className={`admin-promos-page__status admin-promos-page__status--${item.effective_status}`}>
                    {item.effective_status}
                  </div>
                </div>
                <div className="admin-promos-page__item-meta">
                  <span>{item.type === "single_use" ? "одноразовый" : "многоразовый"}</span>
                  <span>{item.discount_percent}%</span>
                  <span>заказов: {item.stats.confirmed_orders_count}</span>
                </div>
                <div className="admin-promos-page__item-actions">
                  <Button variant="secondary" onClick={(event) => { event.stopPropagation(); void onQuickStatus(item.id, "active"); }}>
                    Вкл
                  </Button>
                  <Button variant="secondary" onClick={(event) => { event.stopPropagation(); void onQuickStatus(item.id, "disabled"); }}>
                    Выкл
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="glass admin-promos-page__form">
            <div className="admin-promos-page__section-title">
              {selectedItem ? "Редактирование промокода" : "Новый промокод"}
            </div>

            <label className="admin-promos-page__label">
              Код
              <input
                className="admin-promos-page__input"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="SPRING10"
              />
            </label>

            <label className="admin-promos-page__label">
              Тип
              <select className="admin-promos-page__input" value={type} onChange={(event) => setType(event.target.value as PromoType)}>
                <option value="single_use">одноразовый</option>
                <option value="multi_use">многоразовый</option>
              </select>
            </label>

            <label className="admin-promos-page__label">
              Скидка, %
              <input
                className="admin-promos-page__input"
                type="number"
                min={1}
                max={95}
                value={discountPercent}
                onChange={(event) => setDiscountPercent(event.target.value)}
              />
            </label>

            <label className="admin-promos-page__label">
              Статус
              <select className="admin-promos-page__input" value={status} onChange={(event) => setStatus(event.target.value as PromoStatus)}>
                <option value="active">active</option>
                <option value="disabled">disabled</option>
                <option value="exhausted">exhausted</option>
              </select>
            </label>

            <label className="admin-promos-page__label">
              Срок действия (опционально)
              <input
                className="admin-promos-page__input"
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </label>

            <div className="admin-promos-page__actions">
              <Button onClick={() => void onSave()} disabled={isSaving || isDeleting}>
                {isSaving ? "Сохраняем..." : "Сохранить"}
              </Button>
              <Button variant="secondary" onClick={onResetForm} disabled={isSaving || isDeleting}>
                Новый
              </Button>
              <Button variant="secondary" onClick={() => nav("/admin")} disabled={isSaving || isDeleting}>
                Назад
              </Button>
              <Button variant="secondary" onClick={() => void onDelete()} disabled={!selectedId || isSaving || isDeleting}>
                {isDeleting ? "Удаляем..." : "Удалить"}
              </Button>
            </div>
          </div>
        </div>

        {detail ? (
          <div className="glass admin-promos-page__detail">
            <div className="admin-promos-page__section-title">Статистика по подтверждённым заказам</div>
            <div className="admin-promos-page__stats-grid">
              <div>Заказов: <strong>{detail.stats.confirmed_orders_count}</strong></div>
              <div>Вещей: <strong>{detail.stats.sold_items_count}</strong></div>
              <div>Сумма без скидки: <strong>{rub(detail.stats.subtotal_without_discount_rub)}</strong></div>
              <div>Сумма скидки: <strong>{rub(detail.stats.promo_discount_amount_rub)}</strong></div>
              <div>Сумма после скидки: <strong>{rub(detail.stats.subtotal_with_discount_rub)}</strong></div>
            </div>
            <div className="admin-promos-page__orders">
              {!detail.orders.length ? <div className="admin-promos-page__muted">Подтверждённых заказов по этому промокоду пока нет.</div> : null}
              {detail.orders.map((row) => (
                <div key={row.order_id} className="admin-promos-page__order-row">
                  <div>Заказ: {row.order_id}</div>
                  <div>Пользователь: {row.user?.telegram_username ? `@${row.user.telegram_username}` : `tg:${row.tg_user_id}`}</div>
                  <div>Вещей: {row.items_count}</div>
                  <div>Без скидки: {rub(Number(row.order?.subtotal_without_discount_rub ?? 0))}</div>
                  <div>Скидка: {rub(Number(row.order?.promo_discount_amount_rub ?? 0))}</div>
                  <div>После скидки: {rub(Number(row.order?.subtotal_with_discount_rub ?? 0))}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {errorText ? <div className="admin-promos-page__error">{errorText}</div> : null}
        {successText ? <div className="admin-promos-page__success">{successText}</div> : null}
      </div>
    </Page>
  );
}

export default AdminPromosPage;
