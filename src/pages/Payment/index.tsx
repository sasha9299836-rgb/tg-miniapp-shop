import { useEffect, useMemo, useState } from "react";
import { useBlocker, useLocation, useNavigate } from "react-router-dom";
import { isTgIdentityRequiredError, TG_IDENTITY_REQUIRED_MESSAGE } from "../../shared/auth/tgUser";
import { useUserSessionReadiness } from "../../shared/auth/useUserSessionReadiness";
import { getPaymentProofPutPresign } from "../../shared/api/paymentProofApi";
import {
  cancelPendingOrder,
  clearLastOrderId,
  getOrder,
  readLastOrderId,
  submitPaymentProof,
  type TgOrder,
} from "../../shared/api/ordersApi";
import { formatPackagingLabel, getPackagingFeeRub } from "../../shared/config/packaging";
import { Button } from "../../shared/ui/Button";
import { Card, CardText, CardTitle } from "../../shared/ui/Card";
import { Page } from "../../shared/ui/Page";
import "./styles.css";

function rub(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function formatTimeLeft(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function PaymentPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { isReady, isChecking, errorText: readinessErrorText } = useUserSessionReadiness();
  const queryOrderId = useMemo(() => new URLSearchParams(location.search).get("order"), [location.search]);
  const fallbackOrderId = readLastOrderId();
  const orderId = queryOrderId || fallbackOrderId;

  const [order, setOrder] = useState<TgOrder | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [remainingSec, setRemainingSec] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [isProofSubmitted, setIsProofSubmitted] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!orderId) return;

    const load = async () => {
      setIsLoading(true);
      setErrorText(null);
      try {
        const loaded = await getOrder(orderId);
        if (!loaded) {
          setErrorText("Не найден заказ.");
          return;
        }
        setOrder(loaded);
      } catch (error) {
        console.error("payment getOrder failed", error);
        setErrorText("Не удалось загрузить заказ.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [isReady, orderId]);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const reservedUntil = order?.reserved_until;
    if (!reservedUntil) {
      setRemainingSec(0);
      return;
    }
    const calc = () => {
      const diffMs = new Date(reservedUntil).getTime() - Date.now();
      setRemainingSec(Math.max(0, Math.floor(diffMs / 1000)));
    };
    calc();
    const timer = window.setInterval(calc, 1000);
    return () => window.clearInterval(timer);
  }, [order?.reserved_until]);

  const priceRub = Number(order?.price_rub ?? order?.price ?? 0);
  const deliveryBaseFee = Number(order?.delivery_base_fee_rub ?? 0);
  const deliveryMarkupFee = Number(order?.delivery_markup_rub ?? 60);
  const deliveryFee = Number(order?.delivery_total_fee_rub ?? (deliveryBaseFee + deliveryMarkupFee));
  const packagingFee = Number(order?.packaging_fee_rub ?? getPackagingFeeRub(order?.packaging_type));
  const total = priceRub + deliveryFee + packagingFee;
  const reservationExpired = Boolean(order?.reserved_until) && remainingSec <= 0;
  const canSubmit = Boolean(orderId && order && !reservationExpired && order.reserved_until);

  const hasPendingPaymentOrder = Boolean(
    orderId &&
      order &&
      !isProofSubmitted &&
      (order.status === "created" || order.status === "awaiting_payment_proof"),
  );

  const navigationBlocker = useBlocker(hasPendingPaymentOrder);

  if (isChecking) {
    return (
      <Page>
        <div className="payment-page">
          <div style={{ color: "var(--muted)" }}>Загрузка...</div>
        </div>
      </Page>
    );
  }

  if (readinessErrorText) {
    return (
      <Page>
        <div className="payment-page">
          <Card className="ui-card--padded">
            <CardTitle>Ошибка доступа</CardTitle>
            <CardText>{readinessErrorText}</CardText>
          </Card>
          <Button variant="secondary" onClick={() => nav("/catalog")}>В каталог</Button>
        </div>
      </Page>
    );
  }

  const onSubmitPaymentProof = async () => {
    if (!orderId || !order) {
      setErrorText("Не найден заказ для отправки подтверждения.");
      return;
    }
    if (reservationExpired) {
      setErrorText("Время резерва истекло.");
      return;
    }
    if (!file) {
      setErrorText("Нужно прикрепить файл или фото подтверждения оплаты");
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorText(null);
    try {
      const { url, key } = await getPaymentProofPutPresign({
        order_id: orderId,
        file_name: file.name,
        content_type: file.type || "application/octet-stream",
      });

      const uploadRes = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("UPLOAD_FAILED");

      await submitPaymentProof(orderId, key);
      setIsProofSubmitted(true);
      clearLastOrderId();
    } catch (error) {
      console.error("submit proof failed", error);
      const message = error instanceof Error ? error.message : "UNKNOWN";
      if (message === "UPLOAD_FAILED") {
        setErrorText("Не удалось загрузить файл подтверждения.");
      } else if (message === "ORDER_RESERVATION_EXPIRED") {
        setErrorText("Время на оплату истекло. Заказ больше не ожидает подтверждение оплаты.");
      } else if (message === "ORDER_STATUS_NOT_SUBMITTABLE") {
        setErrorText("Для этого заказа уже нельзя отправить подтверждение оплаты.");
      } else if (isTgIdentityRequiredError(error)) {
        setErrorText(TG_IDENTITY_REQUIRED_MESSAGE);
      } else {
        setErrorText("Не удалось отправить подтверждение.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const onStayInCheckout = () => {
    if (navigationBlocker.state === "blocked") {
      navigationBlocker.reset();
    }
  };

  const onCancelOrderAndLeave = async () => {
    if (!orderId || !order || isCancellingOrder) return;

    setIsCancellingOrder(true);
    setErrorText(null);

    try {
      await cancelPendingOrder(orderId);
      clearLastOrderId();

      if (navigationBlocker.state === "blocked") {
        navigationBlocker.proceed();
      } else {
        nav("/catalog", { replace: true });
      }
    } catch (error) {
      console.error("cancel pending order failed", error);
      const message = error instanceof Error ? error.message : "UNKNOWN";
      if (message === "ORDER_ALREADY_IN_PROCESS" || message === "ORDER_STATUS_NOT_CANCELLABLE") {
        setErrorText("Заказ уже перешел в обработку и не может быть отменен.");
      } else if (isTgIdentityRequiredError(error)) {
        setErrorText(TG_IDENTITY_REQUIRED_MESSAGE);
      } else {
        setErrorText("Не удалось отменить заказ. Попробуйте еще раз.");
      }
    } finally {
      setIsCancellingOrder(false);
    }
  };

  if (!orderId) {
    return (
      <Page>
        <div className="payment-page">
          <Card className="ui-card--padded">
            <CardTitle>Не найден заказ</CardTitle>
            <CardText>Вернитесь в корзину и оформите заказ заново.</CardText>
          </Card>
          <Button variant="secondary" onClick={() => nav("/checkout")}>Назад</Button>
        </div>
      </Page>
    );
  }

  if (isProofSubmitted) {
    return (
      <Page>
        <div className="payment-page">
          <Card className="ui-card--padded">
            <CardTitle>Спасибо за заказ</CardTitle>
            <CardText>Мы получили подтверждение оплаты. Заказ передан в обработку.</CardText>
          </Card>
          <Button onClick={() => nav("/account/orders")}>Посмотреть мои заказы</Button>
          <Button variant="secondary" onClick={() => nav("/")}>На главную</Button>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="payment-page">
        <Card className="ui-card--padded">
          <CardTitle>Оплата заказа</CardTitle>
          <CardText>Оплатите заказ и прикрепите подтверждение оплаты.</CardText>
        </Card>

        <Card className="ui-card--padded">
          <div className="payment-total">
            <div className="payment-total__label">Сумма товара</div>
            <div className="payment-total__value">{rub(priceRub)}</div>
          </div>
          <div className="payment-total__note">Базовая доставка: {rub(deliveryBaseFee)}</div>
          <div className="payment-total__note">Наценка магазина: {rub(deliveryMarkupFee)}</div>
          <div className="payment-total__note">Доставка: {rub(deliveryFee)}</div>
          <div className="payment-total__note">
            {formatPackagingLabel(order?.packaging_type)}: {rub(packagingFee)}
          </div>
          <div className="payment-total__note">Итого: {rub(total)}</div>
          <div className="payment-total__note">
            {order?.reserved_until ? `Оплатите в течение ${formatTimeLeft(remainingSec)}` : "—"}
          </div>
        </Card>

        <Card className="ui-card--padded">
          <div className="payment-requisites">
            <div className="payment-requisites__title">Реквизиты для оплаты</div>
            <div className="payment-requisites__line">Получатель: Miniapp Shop</div>
            <div className="payment-requisites__line">Банк: Тинькофф</div>
            <div className="payment-requisites__line">Карта: 0000 0000 0000 0000</div>
            <div className="payment-requisites__line">Назначение: Оплата заказа</div>
          </div>
        </Card>

        <Card className="ui-card--padded">
          <div className="payment-upload">
            <div className="payment-upload__title">Подтверждение оплаты</div>
            <label className="payment-upload__label" htmlFor="payment-file">
              <svg className="payment-upload__icon" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 4v10m0 0l-4-4m4 4l4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 18h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Выберите файл / фото
            </label>
            <input
              id="payment-file"
              className="payment-upload__input"
              type="file"
              accept="image/*,application/pdf,*/*"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {file ? <div className="payment-upload__file">Файл: {file.name}</div> : null}
            {previewUrl ? <img className="payment-upload__preview" src={previewUrl} alt="preview" /> : null}
          </div>
        </Card>

        <div className="payment-actions">
          <Button onClick={() => void onSubmitPaymentProof()} disabled={!canSubmit || isSubmitting || isLoading || isCancellingOrder}>
            {isSubmitting ? "Отправка..." : "Я оплатил(а)"}
          </Button>
          <Button variant="secondary" onClick={() => nav(-1)} disabled={isCancellingOrder}>Назад</Button>
        </div>

        {isLoading ? <div>Загрузка заказа...</div> : null}
        {errorText ? <div style={{ color: "#b42318" }}>{errorText}</div> : null}
      </div>

      {navigationBlocker.state === "blocked" ? (
        <div className="payment-exit-overlay" onClick={onStayInCheckout}>
          <div className="payment-exit-dialog glass" onClick={(event) => event.stopPropagation()}>
            <div className="payment-exit-dialog__title">Покинуть окно оплаты?</div>
            <div className="payment-exit-dialog__text">
              Вы можете продолжить оформление или отменить заказ.
            </div>
            <div className="payment-exit-dialog__actions">
              <Button variant="secondary" onClick={onStayInCheckout} disabled={isCancellingOrder}>
                Продолжить оформление
              </Button>
              <Button onClick={() => void onCancelOrderAndLeave()} disabled={isCancellingOrder}>
                {isCancellingOrder ? "Отмена..." : "Отменить заказ"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}

export default PaymentPage;
