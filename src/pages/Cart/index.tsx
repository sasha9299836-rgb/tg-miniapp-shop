import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCartStore } from "../../entities/cart/model/useCartStore";
import { useProductsStore } from "../../entities/product/model/useProductsStore";
import { isTgIdentityRequiredError, TG_IDENTITY_REQUIRED_MESSAGE } from "../../shared/auth/tgUser";
import { useUserSessionReadiness } from "../../shared/auth/useUserSessionReadiness";
import {
  listAddressPresets,
  readSelectedPresetId,
  readSelectedPresetSource,
  saveSelectedPresetSelection,
  type TgAddressPreset,
} from "../../shared/api/addressPresetsApi";
import {
  calculateDeliveryQuote,
  clearCheckoutPromoSnapshot,
  previewPromo,
  readCheckoutPromoSnapshot,
  saveCheckoutPromoSnapshot,
  type DeliveryQuoteResult,
  type PromoPreviewSnapshot,
} from "../../shared/api/ordersApi";
import { formatCompactAddressHint } from "../../shared/lib/addressDisplay";
import { getProductDisplayTitle } from "../../shared/lib/productTitle";
import { EmptyState } from "../../shared/ui/EmptyState";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { Page } from "../../shared/ui/Page";
import { ProductThumb } from "../../shared/ui/ProductThumb";
import "./styles.css";

export function CartPage() {
  const nav = useNavigate();
  const cart = useCartStore();
  const { products, load } = useProductsStore();
  const { isReady, isChecking, errorText: readinessErrorText } = useUserSessionReadiness();
  const [presets, setPresets] = useState<TgAddressPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<TgAddressPreset | null>(null);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuoteResult | null>(null);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState<string | null>(null);
  const [isDeliveryQuoteLoading, setIsDeliveryQuoteLoading] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [promoSnapshot, setPromoSnapshot] = useState<PromoPreviewSnapshot | null>(null);
  const [isPromoApplying, setIsPromoApplying] = useState(false);
  const [promoErrorText, setPromoErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    void load();
    void cart.load();
  }, [isReady, load]);

  useEffect(() => {
    if (!isReady) return;
    const mapped = products.map((product) => ({ id: product.id, postId: product.postId }));
    cart.registerCatalogItems(mapped);
  }, [isReady, products]);

  useEffect(() => {
    if (!isReady) return;
    const availablePostIds = products
      .filter((product) => product.saleStatus === "available")
      .map((product) => String(product.postId ?? "").trim())
      .filter(Boolean);

    if (!availablePostIds.length && !products.length) return;

    void cart.pruneUnavailable(availablePostIds).then((removed) => {
      if (removed > 0) {
        const note = cart.consumeNotice();
        if (note) {
          setDeliveryQuoteError(note);
        }
      }
    });
  }, [isReady, products]);

  useEffect(() => {
    if (!isReady) return;
    const loadPresets = async () => {
      try {
        setPresetError(null);
        const rows = await listAddressPresets();
        setPresets(rows);
        const selectedId = readSelectedPresetId();
        const selectedSource = readSelectedPresetSource();
        const manualSelected =
          selectedSource === "manual" ? rows.find((row) => row.id === selectedId) ?? null : null;
        const active =
          manualSelected ??
          rows.find((row) => row.is_default) ??
          rows[0] ??
          null;
        setSelectedPreset(active);
        saveSelectedPresetSelection(active?.id ?? null, manualSelected ? "manual" : "auto");
      } catch (error) {
        console.error("cart presets load failed", error);
        setPresetError(isTgIdentityRequiredError(error) ? TG_IDENTITY_REQUIRED_MESSAGE : "Не удалось загрузить адрес получателя.");
      }
    };

    void loadPresets();
  }, [isReady]);

  const lines = useMemo(() => {
    return cart.items
      .map((item) => {
        const product = products.find((row) => row.id === item.productId);
        if (!product) return null;
        return { ...item, product, lineSum: product.price * item.qty };
      })
      .filter(Boolean) as Array<{
        productId: number;
        qty: number;
        product: {
          id: number;
          title: string;
          description?: string;
          price: number;
          images?: string[];
          postId?: string;
        };
        lineSum: number;
      }>;
  }, [cart.items, products]);

  const quotePostIds = useMemo(
    () =>
      lines.flatMap((line) => {
        const postId = line.product.postId ? String(line.product.postId) : "";
        if (!postId) return [];
        return Array.from({ length: Math.max(1, line.qty) }, () => postId);
      }),
    [lines],
  );

  useEffect(() => {
    if (!isReady) return;
    const run = async () => {
      if (!quotePostIds.length || !selectedPreset?.city_code || !selectedPreset?.pvz_code) {
        setDeliveryQuote(null);
        setDeliveryQuoteError(null);
        return;
      }

      setIsDeliveryQuoteLoading(true);
      setDeliveryQuoteError(null);
      try {
        const quote = await calculateDeliveryQuote({
          post_ids: quotePostIds,
          receiver_city_code: selectedPreset.city_code,
          delivery_point: selectedPreset.pvz_code,
        });
        setDeliveryQuote(quote);
      } catch (error) {
        console.error("cart delivery quote failed", error);
        setDeliveryQuote(null);
        setDeliveryQuoteError("Не удалось рассчитать доставку. Проверьте адрес и попробуйте снова.");
      } finally {
        setIsDeliveryQuoteLoading(false);
      }
    };
    void run();
  }, [isReady, quotePostIds, selectedPreset?.city_code, selectedPreset?.pvz_code]);

  const itemsSum = useMemo(() => lines.reduce((sum, line) => sum + line.lineSum, 0), [lines]);
  const discountedItemsSum = useMemo(() => {
    if (!promoSnapshot) return itemsSum;
    if (promoSnapshot.subtotal_without_discount_rub !== itemsSum) return itemsSum;
    return promoSnapshot.subtotal_with_discount_rub;
  }, [itemsSum, promoSnapshot]);
  const deliveryTotalFee = deliveryQuote?.delivery_total_fee_rub ?? 0;
  const total = discountedItemsSum + deliveryTotalFee;
  const totalQty = cart.totalQty();
  const hasValidDeliveryAddress = Boolean(selectedPreset?.city_code && selectedPreset?.pvz_code);

  useEffect(() => {
    const saved = readCheckoutPromoSnapshot();
    if (!saved) return;
    setPromoSnapshot(saved);
    setPromoCodeInput(saved.promo_code);
  }, []);

  useEffect(() => {
    if (!promoSnapshot) return;
    if (promoSnapshot.subtotal_without_discount_rub === itemsSum) return;
    setPromoSnapshot(null);
    clearCheckoutPromoSnapshot();
  }, [itemsSum, promoSnapshot]);

  const onApplyPromo = async () => {
    const code = promoCodeInput.trim();
    if (!code) {
      setPromoErrorText("Введите промокод.");
      return;
    }
    if (!quotePostIds.length) {
      setPromoErrorText("Корзина пуста.");
      return;
    }
    setIsPromoApplying(true);
    setPromoErrorText(null);
    try {
      const snapshot = await previewPromo({
        post_ids: quotePostIds,
        promo_code: code,
      });
      setPromoSnapshot(snapshot);
      setPromoCodeInput(snapshot.promo_code);
      saveCheckoutPromoSnapshot(snapshot);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("PROMO_NOT_FOUND")) setPromoErrorText("Промокод не найден.");
      else if (message.includes("PROMO_DISABLED")) setPromoErrorText("Промокод выключен.");
      else if (message.includes("PROMO_EXPIRED")) setPromoErrorText("Срок действия промокода истёк.");
      else if (message.includes("PROMO_EXHAUSTED")) setPromoErrorText("Промокод исчерпан.");
      else if (message.includes("PROMO_ALREADY_USED_BY_USER")) setPromoErrorText("Этот одноразовый промокод уже использован.");
      else setPromoErrorText("Не удалось применить промокод.");
    } finally {
      setIsPromoApplying(false);
    }
  };

  const onRemovePromo = () => {
    setPromoSnapshot(null);
    setPromoCodeInput("");
    setPromoErrorText(null);
    clearCheckoutPromoSnapshot();
  };

  if (isChecking) {
    return (
      <Page>
        <div className="cart-page">
          <div style={{ color: "var(--muted)" }}>Загрузка...</div>
        </div>
      </Page>
    );
  }

  if (readinessErrorText) {
    return (
      <Page>
        <div className="cart-page">
          <div style={{ color: "#b42318" }}>{readinessErrorText}</div>
          <div className="cart-actions">
            <Button onClick={() => nav("/catalog")}>В каталог</Button>
          </div>
        </div>
      </Page>
    );
  }

  if (!cart.items.length) {
    return (
      <Page>
        <div className="cart-page">
          <div className="cart-header">
            <h1 className="cart-title">Корзина</h1>
          </div>
          <EmptyState
            title="Корзина пуста"
            text="Добавьте товары из каталога, чтобы оформить заказ."
          />
          <div className="cart-actions">
            <Button onClick={() => nav("/catalog")}>В каталог</Button>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="cart-page">
        <div className="cart-header">
          <h1 className="cart-title">Корзина</h1>
          <Button variant="secondary" className="cart-clear" onClick={() => cart.clear()}>
            Удалить все
          </Button>
        </div>

        <div className="cart-grid">
          {lines.map((line) => (
            <Card key={line.productId} className="ui-card--padded cart-item">
              <div className="cart-item__row">
                <ProductThumb
                  src={line.product.images?.[0]}
                  alt={line.product.title}
                  variant="square"
                  className="cart-item__thumb"
                />
                <div>
                  <div className="cart-item__title">{getProductDisplayTitle(line.product)}</div>
                  {line.product.description ? (
                    <div className="cart-item__desc">{line.product.description}</div>
                  ) : null}
                  <div className="cart-item__price">
                    {line.qty === 1
                      ? `${line.product.price.toLocaleString("ru-RU")} ₽`
                      : `${line.product.price.toLocaleString("ru-RU")} ₽ × ${line.qty} = ${line.lineSum.toLocaleString("ru-RU")} ₽`}
                  </div>
                </div>
              </div>

              <div className="cart-item__actions">
                <Button variant="secondary" onClick={() => void cart.remove({ id: line.productId, postId: line.product.postId })}>Удалить</Button>
              </div>
            </Card>
          ))}
        </div>

        <Card className="ui-card--padded cart-recipient">
          <div className="cart-section__title">Адрес доставки</div>
          {presets.length ? (
            <select
              className="cart-address-select"
              value={selectedPreset?.id ?? ""}
              onChange={(event) => {
                const nextId = event.target.value || null;
                const nextPreset = presets.find((row) => row.id === nextId) ?? null;
                setSelectedPreset(nextPreset);
                saveSelectedPresetSelection(nextPreset?.id ?? null, "manual");
              }}
            >
              {presets.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.name}
                </option>
              ))}
            </select>
          ) : null}
          {selectedPreset ? (
            <div className="cart-address-hint">
              {formatCompactAddressHint(selectedPreset)}
            </div>
          ) : null}

          {presetError ? <div className="cart-muted">{presetError}</div> : null}
          {!presets.length ? (
            <div className="cart-address-empty">
              <div className="cart-muted">Адреса пока не добавлены.</div>
              <Button variant="secondary" onClick={() => nav("/account/addresses")}>Добавить адрес доставки</Button>
            </div>
          ) : null}
        </Card>

        <Card className="ui-card--padded cart-total">
          <div className="cart-promo">
            <div className="cart-section__title">Промокод</div>
            <div className="cart-promo__row">
              <input
                className="cart-promo__input"
                value={promoCodeInput}
                onChange={(event) => setPromoCodeInput(event.target.value.toUpperCase())}
                placeholder="Введите код"
              />
              <Button variant="secondary" onClick={() => void onApplyPromo()} disabled={isPromoApplying}>
                {isPromoApplying ? "..." : "Применить"}
              </Button>
              {promoSnapshot ? (
                <Button variant="secondary" onClick={onRemovePromo}>
                  Убрать
                </Button>
              ) : null}
            </div>
            {promoErrorText ? <div className="cart-checkout-error">{promoErrorText}</div> : null}
          </div>
          <div className="cart-total__row">
            <div className="cart-total__label">Товары ({totalQty})</div>
            {promoSnapshot && discountedItemsSum !== itemsSum ? (
              <div className="cart-total__value cart-total__value--promo">
                <span className="cart-total__old">{itemsSum.toLocaleString("ru-RU")} ₽</span>
                <span>{discountedItemsSum.toLocaleString("ru-RU")} ₽</span>
              </div>
            ) : (
              <div className="cart-total__value">{itemsSum.toLocaleString("ru-RU")} ₽</div>
            )}
          </div>
          <div className="cart-total__row">
            <div className="cart-total__label">Доставка</div>
            <div className="cart-total__value">
              {isDeliveryQuoteLoading ? "..." : `${deliveryTotalFee.toLocaleString("ru-RU")} ₽`}
            </div>
          </div>
          <div className="cart-total__row cart-total__sum">
            <div className="cart-total__label">Итого</div>
            <div className="cart-total__value">{total.toLocaleString("ru-RU")} ₽</div>
          </div>
          {deliveryQuoteError ? <div className="cart-muted">{deliveryQuoteError}</div> : null}
          {!deliveryQuote && !isDeliveryQuoteLoading ? (
            <div className="cart-muted">Стоимость доставки появится после выбора валидного адреса.</div>
          ) : null}
          {!hasValidDeliveryAddress ? (
            <div className="cart-checkout-error">Нельзя перейти к оплате, пока не добавите адрес доставки.</div>
          ) : null}
          <Button
            disabled={!hasValidDeliveryAddress}
            onClick={() => {
              if (!hasValidDeliveryAddress) return;
              nav("/checkout");
            }}
          >
            Перейти к оплате
          </Button>
        </Card>
      </div>
    </Page>
  );
}

export default CartPage;

