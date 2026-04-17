import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { Page } from "../../../shared/ui/Page";
import { AdminDateTimeField } from "../DateTimeField";
import {
  deleteAdminPromo,
  getAdminPromoDetail,
  listAdminPromos,
  setAdminPromoStatus,
  upsertAdminPromo,
  type AdminPromoDetail,
  type AdminPromoListItem,
  type PromoEffectiveStatus,
  type PromoStatus,
  type PromoType,
} from "../../../shared/api/adminPromoApi";
import "../datetime-controls.css";
import "./styles.css";

function rub(value: number) {
  return `${Number(value ?? 0).toLocaleString("ru-RU")} ₽`;
}

function toLocalDatetimeValue(iso: string | null | undefined): string {
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

function nowLocalDatetimeValue(): string {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function promoTypeLabel(type: PromoType): string {
  return type === "single_use" ? "Одноразовый" : "Многоразовый";
}

function promoStatusLabel(status: PromoStatus | PromoEffectiveStatus): string {
  switch (status) {
    case "active":
      return "Активен";
    case "disabled":
      return "Неактивен";
    case "exhausted":
      return "Исчерпан";
    case "expired":
      return "Истёк";
    default:
      return String(status);
  }
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
  const [activeFrom, setActiveFrom] = useState(nowLocalDatetimeValue());
  const [activeTo, setActiveTo] = useState("");
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
    setActiveFrom(toLocalDatetimeValue(promo.active_from) || nowLocalDatetimeValue());
    setActiveTo(toLocalDatetimeValue(promo.active_to ?? promo.expires_at ?? null));
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
    setActiveFrom(nowLocalDatetimeValue());
    setActiveTo("");
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
    const activeFromIso = fromLocalDatetimeValue(activeFrom);
    const activeToIso = fromLocalDatetimeValue(activeTo);
    if (!activeFromIso) {
      setErrorText("Заполните поле «Активен с».");
      return;
    }
    if (activeToIso) {
      const fromMs = new Date(activeFromIso).getTime();
      const toMs = new Date(activeToIso).getTime();
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
        setErrorText("Дата «Активен до» должна быть позже «Активен с».");
        return;
      }
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
        active_from: activeFromIso,
        active_to: activeToIso,
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
      } else if (message.includes("PROMO_ACTIVE_RANGE_INVALID")) {
        setErrorText("Период действия задан неверно.");
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
        <div className="glass admin-promos-page__form">
          <div className="admin-promos-page__section-title">
            {selectedItem ? "Редактирование промокода" : "Новый промокод"}
          </div>

          <label className="admin-promos-page__label">
            Код
            <input
              className="admin-promos-page__input admin-post-form-control"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="SPRING10"
            />
          </label>

          <label className="admin-promos-page__label">
            Тип
            <select
              className="admin-promos-page__input admin-post-form-control"
              value={type}
              onChange={(event) => setType(event.target.value as PromoType)}
            >
              <option value="single_use">Одноразовый</option>
              <option value="multi_use">Многоразовый</option>
            </select>
          </label>

          <label className="admin-promos-page__label">
            Скидка, %
            <input
              className="admin-promos-page__input admin-post-form-control"
              type="number"
              min={1}
              max={95}
              value={discountPercent}
              onChange={(event) => setDiscountPercent(event.target.value)}
            />
          </label>

          <label className="admin-promos-page__label">
            Статус
            <select
              className="admin-promos-page__input admin-post-form-control"
              value={status}
              onChange={(event) => setStatus(event.target.value as PromoStatus)}
            >
              <option value="active">Активен</option>
              <option value="disabled">Неактивен</option>
              <option value="exhausted">Исчерпан</option>
            </select>
          </label>

          <div className="admin-promos-page__range">
            <AdminDateTimeField
              id="promo-active-from"
              label="Активен с"
              value={activeFrom}
              onChange={setActiveFrom}
              placeholder="Выберите дату и время"
            />
            <AdminDateTimeField
              id="promo-active-to"
              label="Активен до"
              value={activeTo}
              onChange={setActiveTo}
              placeholder="Выберите дату и время"
            />
          </div>

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
                  {promoStatusLabel(item.effective_status)}
                </div>
              </div>
              <div className="admin-promos-page__item-meta">
                <span>{promoTypeLabel(item.type)}</span>
                <span>{item.discount_percent}%</span>
                <span>Заказов: {item.stats.confirmed_orders_count}</span>
                <span>С: {toLocalDatetimeValue(item.active_from) || "—"}</span>
                <span>По: {toLocalDatetimeValue(item.active_to ?? item.expires_at ?? null) || "—"}</span>
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

        {errorText ? <div className="admin-promos-page__error">{errorText}</div> : null}
        {successText ? <div className="admin-promos-page__success">{successText}</div> : null}
      </div>
    </Page>
  );
}

export default AdminPromosPage;
