import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCartStore } from "../../entities/cart/model/useCartStore";
import { useProductsStore } from "../../entities/product/model/useProductsStore";
import { getCurrentTgUserId, isTgIdentityRequiredError, TG_IDENTITY_REQUIRED_MESSAGE } from "../../shared/auth/tgUser";
import { useUserSessionReadiness } from "../../shared/auth/useUserSessionReadiness";
import {
  calculateDeliveryQuote,
  clearCheckoutPromoSnapshot,
  createOrder,
  previewCheckoutPricing,
  readCheckoutPromoSnapshot,
  saveCheckoutPromoSnapshot,
  saveLastOrderId,
  type PromoPreviewSnapshot,
  type DeliveryQuoteResult,
  type PackagingType,
} from "../../shared/api/ordersApi";
import {
  listAddressPresets,
  readSelectedPresetId,
  readSelectedPresetSource,
  saveSelectedPresetSelection,
  type TgAddressPreset,
} from "../../shared/api/addressPresetsApi";
import { EmptyState } from "../../shared/ui/EmptyState";
import { Button } from "../../shared/ui/Button";
import { Card, CardText, CardTitle } from "../../shared/ui/Card";
import { Page } from "../../shared/ui/Page";
import "./styles.css";

function rub(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function isValidFio(value: string): boolean {
  return value.trim().split(/\s+/).filter(Boolean).length >= 2;
}

function shortenPvz(value: string): string {
  const max = 52;
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function getAddressOptionLabel(address: TgAddressPreset): string {
  return address.name;
}

export function CheckoutPage() {
  const nav = useNavigate();
  const cartItems = useCartStore((state) => state.items);
  const loadCart = useCartStore((state) => state.load);
  const registerCartCatalogItems = useCartStore((state) => state.registerCatalogItems);
  const pruneUnavailable = useCartStore((state) => state.pruneUnavailable);
  const consumeCartNotice = useCartStore((state) => state.consumeNotice);
  const products = useProductsStore((state) => state.products);
  const loadProducts = useProductsStore((state) => state.load);
  const { isReady, isChecking, errorText: readinessErrorText } = useUserSessionReadiness();

  const [addresses, setAddresses] = useState<TgAddressPreset[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [recipientFio, setRecipientFio] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [city, setCity] = useState("");
  const [pvz, setPvz] = useState("");
  const packagingType: PackagingType = "standard";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuoteResult | null>(null);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState<string | null>(null);
  const [isDeliveryQuoteLoading, setIsDeliveryQuoteLoading] = useState(false);
  const [pricingSnapshot, setPricingSnapshot] = useState<PromoPreviewSnapshot | null>(null);
  const [isOfferAccepted, setIsOfferAccepted] = useState(false);
  const [isPrivacyAccepted, setIsPrivacyAccepted] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    if (!products.length) void loadProducts();
    void loadCart();
  }, [isReady, products.length, loadProducts, loadCart]);

  useEffect(() => {
    if (!isReady) return;
    const mapped = products.map((product) => ({ id: product.id, postId: product.postId }));
    registerCartCatalogItems(mapped);
  }, [isReady, products, registerCartCatalogItems]);

  useEffect(() => {
    if (!isReady) return;
    const availablePostIds = products
      .filter((product) => product.saleStatus === "available")
      .map((product) => String(product.postId ?? "").trim())
      .filter(Boolean);
    if (!availablePostIds.length && !products.length) return;
    void pruneUnavailable(availablePostIds).then((removed) => {
      if (removed > 0) {
        const note = consumeCartNotice();
        if (note) setErrorText(note);
        }
      });
  }, [isReady, products, pruneUnavailable, consumeCartNotice]);

  useEffect(() => {
    if (!isReady) return;
    const loadAddresses = async () => {
      try {
        const rows = await listAddressPresets();
        setAddresses(rows);
        const selectedId = readSelectedPresetId();
        const selectedSource = readSelectedPresetSource();
        const manualSelected =
          selectedSource === "manual" ? rows.find((row) => row.id === selectedId) ?? null : null;
        const active =
          manualSelected ??
          rows.find((row) => row.is_default) ??
          rows[0] ??
          null;
        setSelectedAddressId(active?.id ?? null);
        saveSelectedPresetSelection(active?.id ?? null, manualSelected ? "manual" : "auto");
        if (active) {
          setRecipientFio(active.recipient_fio);
          setRecipientPhone(active.recipient_phone);
          setCity(active.city);
          setPvz(active.pvz);
        }
      } catch (error) {
        console.error("checkout addresses load failed", error);
        if (isTgIdentityRequiredError(error)) {
          setErrorText(TG_IDENTITY_REQUIRED_MESSAGE);
        }
      }
    };
    void loadAddresses();
  }, [isReady]);

  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId],
  );

  useEffect(() => {
    if (!selectedAddress) return;
    setRecipientFio(selectedAddress.recipient_fio);
    setRecipientPhone(selectedAddress.recipient_phone);
    setCity(selectedAddress.city);
    setPvz(selectedAddress.pvz);
  }, [selectedAddress]);

  const itemsWithProducts = useMemo(() => {
    return cartItems
      .map((item) => {
        const product = products.find((row) => row.id === item.productId);
        return product ? { ...item, product } : null;
      })
      .filter(Boolean) as Array<{
        productId: number;
        qty: number;
        product: { id: number; postId?: string; title: string; price: number };
      }>;
  }, [cartItems, products]);

  const createOrderPostIds = useMemo(
    () =>
      [...new Set(
        itemsWithProducts
          .map((item) => (item.product.postId ? String(item.product.postId) : ""))
          .filter(Boolean),
      )],
    [itemsWithProducts],
  );
  const quotePostIds = useMemo(
    () =>
      itemsWithProducts.flatMap((item) => {
        const postId = item.product.postId ? String(item.product.postId) : "";
        if (!postId) return [];
        return Array.from({ length: Math.max(1, item.qty) }, () => postId);
      }),
    [itemsWithProducts],
  );

  useEffect(() => {
    if (!isReady) return;
    const run = async () => {
      if (
        !quotePostIds.length ||
        !selectedAddress?.city_code ||
        !selectedAddress?.pvz_code
      ) {
        setDeliveryQuote(null);
        setDeliveryQuoteError(null);
        return;
      }

      setIsDeliveryQuoteLoading(true);
      setDeliveryQuoteError(null);
      try {
        const quote = await calculateDeliveryQuote({
          post_ids: quotePostIds,
          receiver_city_code: selectedAddress.city_code,
          delivery_point: selectedAddress.pvz_code,
        });
        setDeliveryQuote(quote);
      } catch (error) {
        console.error("checkout delivery quote failed", error);
        setDeliveryQuote(null);
        setDeliveryQuoteError("Не удалось рассчитать доставку. Проверьте адрес и попробуйте снова.");
      } finally {
        setIsDeliveryQuoteLoading(false);
      }
    };
    void run();
  }, [isReady, quotePostIds, selectedAddress?.city_code, selectedAddress?.pvz_code]);

  const itemsSum = useMemo(
    () => itemsWithProducts.reduce((sum, item) => sum + item.product.price * item.qty, 0),
    [itemsWithProducts],
  );
  const discountedItemsSum = useMemo(() => {
    if (!pricingSnapshot) return itemsSum;
    if (pricingSnapshot.subtotal_without_discount_rub !== itemsSum) return itemsSum;
    return pricingSnapshot.subtotal_with_all_discounts_rub;
  }, [itemsSum, pricingSnapshot]);

  const deliveryTotalFee = deliveryQuote?.delivery_total_fee_rub ?? 0;
  const deliveryDiscountAmount = pricingSnapshot?.delivery_discount_amount_rub ?? 0;
  const payableDeliveryFee = Math.max(0, deliveryTotalFee - deliveryDiscountAmount);
  const total = pricingSnapshot?.subtotal_without_discount_rub === itemsSum
    ? pricingSnapshot.final_total_rub
    : (discountedItemsSum + payableDeliveryFee);
  const isLegalAccepted = isOfferAccepted && isPrivacyAccepted;

  useEffect(() => {
    const snapshot = readCheckoutPromoSnapshot();
    if (!snapshot) return;
    setPricingSnapshot(snapshot);
  }, []);

  useEffect(() => {
    if (!pricingSnapshot) return;
    if (pricingSnapshot.subtotal_without_discount_rub === itemsSum) return;
    setPricingSnapshot(null);
    clearCheckoutPromoSnapshot();
  }, [itemsSum, pricingSnapshot]);

  useEffect(() => {
    if (!isReady) return;
    if (!quotePostIds.length) {
      setPricingSnapshot(null);
      clearCheckoutPromoSnapshot();
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const snapshot = await previewCheckoutPricing({
          post_ids: quotePostIds,
          promo_code: pricingSnapshot?.promo_code ?? null,
          delivery_total_fee_rub: deliveryTotalFee,
        });
        if (cancelled) return;
        setPricingSnapshot(snapshot);
        if (snapshot.promo_code) {
          saveCheckoutPromoSnapshot(snapshot);
        }
      } catch {
        if (cancelled) return;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isReady, quotePostIds, deliveryTotalFee, pricingSnapshot?.promo_code]);

  if (isChecking) {
    return (
      <Page>
        <div className="checkout-page">
          <div style={{ color: "var(--muted)" }}>Загрузка...</div>
        </div>
      </Page>
    );
  }

  if (readinessErrorText) {
    return (
      <Page>
        <div className="checkout-page">
          <div style={{ color: "#b42318" }}>{readinessErrorText}</div>
          <Button variant="secondary" onClick={() => nav("/catalog")}>В каталог</Button>
        </div>
      </Page>
    );
  }

  const validate = (): string | null => {
    const tgUserId = getCurrentTgUserId();
    if (!Number.isInteger(tgUserId) || tgUserId <= 0) {
      return "Не удалось определить пользователя. Перезапустите приложение.";
    }
    if (!itemsWithProducts.length) {
      return "Корзина пуста.";
    }
    if (!selectedAddressId) {
      return "Выберите адрес доставки.";
    }
    if (!isValidFio(recipientFio)) {
      return "Введите ФИО минимум в формате «Имя Фамилия».";
    }
    if (!/^\+7\(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(recipientPhone)) {
      return "Введите телефон в формате +7(XXX) XXX-XX-XX.";
    }
    if (!city.trim()) return "Укажите город.";
    if (!pvz.trim()) return "Укажите пункт выдачи.";
    if (!selectedAddress?.city_code || !selectedAddress?.pvz_code) {
      return "Обновите адрес в разделе адресов: нужно выбрать город и ПВЗ из справочника.";
    }
    const hasMissingPostIds = itemsWithProducts.some((item) => !item.product.postId);
    if (!createOrderPostIds.length || hasMissingPostIds) {
      return "Часть товаров недоступна для оформления.";
    }
    if (!deliveryQuote) {
      return "Не удалось получить стоимость доставки. Проверьте адрес и повторите попытку.";
    }
    return null;
  };

  const onCreateOrder = async () => {
    if (isSubmitting) return;
    setErrorText(null);

    const validationError = validate();
    if (validationError) {
      setErrorText(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const createPayload = {
        post_ids: createOrderPostIds,
        delivery_type: "pickup" as const,
        fio: recipientFio.trim(),
        phone: recipientPhone.trim(),
        city: city.trim(),
        cdek_pvz_code: selectedAddress?.pvz_code ?? null,
        cdek_pvz_address: pvz.trim(),
        receiver_city_code: selectedAddress?.city_code ?? null,
        delivery_point: selectedAddress?.pvz_code ?? null,
        packaging_type: packagingType,
        address_preset_id: selectedAddressId,
        street: null,
        house: null,
        entrance: null,
        apartment: null,
        floor: null,
        delivery_base_fee_rub: deliveryQuote?.delivery_base_fee_rub ?? 0,
        delivery_markup_rub: (deliveryQuote?.delivery_markup_rub ?? 60) + (deliveryQuote?.package_fee_rub ?? 0),
        delivery_total_fee_rub: deliveryQuote?.delivery_total_fee_rub ?? 0,
        promo_code: pricingSnapshot?.promo_code ?? null,
      };

      const created = await createOrder(createPayload);
      saveLastOrderId(created.order_id);
      clearCheckoutPromoSnapshot();
      saveSelectedPresetSelection(selectedAddressId, "manual");
      nav(`/payment?order=${encodeURIComponent(created.order_id)}`, { replace: true });
    } catch (error) {
      console.error("checkout create flow failed", error);
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      if (isTgIdentityRequiredError(error)) {
        setErrorText(TG_IDENTITY_REQUIRED_MESSAGE);
      } else if (message.includes("PROMO_NOT_FOUND")) {
        setErrorText("Промокод не найден. Примените код заново.");
      } else if (message.includes("PROMO_DISABLED")) {
        setErrorText("Промокод выключен.");
      } else if (message.includes("PROMO_NOT_STARTED")) {
        setErrorText("Промокод ещё не активен.");
      } else if (message.includes("PROMO_EXPIRED")) {
        setErrorText("Срок действия промокода истёк.");
      } else if (message.includes("PROMO_EXHAUSTED")) {
        setErrorText("Промокод исчерпан.");
      } else if (message.includes("PROMO_ALREADY_USED_BY_USER")) {
        setErrorText("Этот одноразовый промокод уже использован.");
      } else if (message.includes("NOT_AVAILABLE")) {
        setErrorText("Товар уже зарезервирован или продан.");
      } else if (message.includes("PERMISSION_DENIED")) {
        setErrorText("Нет прав на создание заказа. Проверьте настройки доступа.");
      } else if (message.includes("CHECKOUT_RECIPIENT_REQUIRED")) {
        setErrorText("Не удалось оформить заказ: не указаны данные получателя.");
      } else if (message.includes("CHECKOUT_RECEIVER_CITY_CODE_REQUIRED")) {
        setErrorText("Не удалось оформить заказ: не выбран город доставки.");
      } else if (message.includes("CHECKOUT_DELIVERY_POINT_REQUIRED")) {
        setErrorText("Не удалось оформить заказ: не выбран пункт выдачи.");
      } else if (message.includes("CHECKOUT_POST_PACKAGING_PRESET_REQUIRED")) {
        setErrorText("Не удалось оформить заказ: у товара не задана упаковка.");
      } else if (message.includes("CHECKOUT_POST_ORIGIN_PROFILE_REQUIRED")) {
        setErrorText("Не удалось оформить заказ: у товара не задан профиль отправки.");
      } else if (message.includes("CHECKOUT_PACKAGE_DIMENSIONS_REQUIRED")) {
        setErrorText("Не удалось оформить заказ: у товара не заданы параметры упаковки.");
      } else if (message.includes("CHECKOUT_DELIVERY_QUOTE_REQUIRED")) {
        setErrorText("Не удалось оформить заказ: сначала рассчитайте доставку.");
      } else if (message.includes("CHECKOUT_DELIVERY_TOTAL_MISMATCH")) {
        setErrorText("Не удалось оформить заказ: стоимость доставки устарела, пересчитайте и попробуйте снова.");
      } else {
        setErrorText("Не удалось оформить заказ. Проверьте данные и повторите попытку.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!cartItems.length) {
    return (
      <Page>
        <div className="checkout-page">
          <EmptyState title="Корзина пуста" text="Добавьте товар в корзину перед оформлением." />
          <Button variant="secondary" onClick={() => nav("/catalog")}>В каталог</Button>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="checkout-page">
        <Card className="ui-card--padded">
          <CardTitle>Оформление заказа</CardTitle>
          <CardText>Проверьте данные перед переходом к оплате.</CardText>
        </Card>

        <Card className="ui-card--padded checkout-delivery">
          <div className="checkout-section__title">Адрес доставки</div>
          {addresses.length ? (
            <>
              <select
                className="checkout-address-select"
                value={selectedAddressId ?? ""}
                onChange={(event) => {
                  const nextId = event.target.value || null;
                  setSelectedAddressId(nextId);
                  saveSelectedPresetSelection(nextId, "manual");
                }}
              >
                {addresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {getAddressOptionLabel(address)}
                  </option>
                ))}
              </select>
              {selectedAddress ? (
                <div className="checkout-address-hint">
                  {selectedAddress.city}, {shortenPvz(selectedAddress.pvz)}
                </div>
              ) : null}
              <Button variant="secondary" onClick={() => nav("/account/addresses")}>
                Управлять адресами
              </Button>
            </>
          ) : (
            <>
              <div style={{ color: "var(--muted)" }}>Сохранённых адресов пока нет. Добавьте адрес в профиле.</div>
              <Button variant="secondary" onClick={() => nav("/account/addresses")}>
                Добавить в профиле
              </Button>
            </>
          )}
        </Card>

        <Card className="ui-card--padded checkout-total">
          <div className="checkout-total__row">
            <span>Товары</span>
            {pricingSnapshot && discountedItemsSum !== itemsSum ? (
              <span className="checkout-total__promo-value">
                <span className="checkout-total__old-value">{rub(itemsSum)}</span>
                <span>{rub(discountedItemsSum)}</span>
              </span>
            ) : (
              <span>{rub(itemsSum)}</span>
            )}
          </div>
          <div className="checkout-total__row checkout-total__divider">
            <span>Доставка</span>
            <span>{isDeliveryQuoteLoading ? "..." : rub(payableDeliveryFee)}</span>
          </div>
          <div className="checkout-total__row checkout-total__sum">
            <span>Итого</span>
            <span>{rub(total)}</span>
          </div>
          {pricingSnapshot?.promo_code ? (
            <div className="checkout-total__promo-note">
              Промокод: {pricingSnapshot.promo_code} (-{pricingSnapshot.promo_discount_percent}%)
              <button
                type="button"
                className="checkout-total__promo-remove"
                onClick={() => {
                  setPricingSnapshot(null);
                  clearCheckoutPromoSnapshot();
                }}
              >
                Убрать
              </button>
            </div>
          ) : null}
          {deliveryDiscountAmount > 0 ? (
            <div className="checkout-total__promo-note">Скидка на доставку: -{rub(deliveryDiscountAmount)}</div>
          ) : null}
          {pricingSnapshot?.loyalty_discount_amount_rub ? (
            <div className="checkout-total__promo-note">Loyalty-скидка: -{rub(pricingSnapshot.loyalty_discount_amount_rub)}</div>
          ) : null}
        </Card>

        <div className="checkout-actions">
          <Card className="ui-card--padded checkout-consents">
            <label className="checkout-consent-row">
              <input
                type="checkbox"
                checked={isOfferAccepted}
                onChange={(event) => setIsOfferAccepted(event.target.checked)}
              />
              <span>
                Я ознакомился и согласен с{" "}
                <Link to="/account/offer" className="checkout-consent-link">
                  Публичной офертой
                </Link>
              </span>
            </label>

            <label className="checkout-consent-row">
              <input
                type="checkbox"
                checked={isPrivacyAccepted}
                onChange={(event) => setIsPrivacyAccepted(event.target.checked)}
              />
              <span>
                Я ознакомился и согласен с{" "}
                <Link to="/account/privacy" className="checkout-consent-link">
                  Политикой конфиденциальности
                </Link>
              </span>
            </label>

            {!isLegalAccepted ? (
              <div className="checkout-consent-hint">
                Чтобы продолжить, подтвердите согласие с офертой и политикой.
              </div>
            ) : null}
          </Card>

          <Button
            onClick={() => void onCreateOrder()}
            disabled={isSubmitting || !itemsWithProducts.length || isDeliveryQuoteLoading || !isLegalAccepted}
          >
            {isSubmitting ? "Создаем заказ..." : "Перейти к оплате"}
          </Button>
          <Button variant="secondary" onClick={() => nav(-1)}>Назад</Button>
        </div>

        {deliveryQuoteError ? <div style={{ color: "#b42318" }}>{deliveryQuoteError}</div> : null}
        {errorText ? <div style={{ color: "#b42318" }}>{errorText}</div> : null}
      </div>
    </Page>
  );
}

export default CheckoutPage;
