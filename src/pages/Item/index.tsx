import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProductsStore } from "../../entities/product/model/useProductsStore";
import { useFavoritesStore } from "../../entities/favorites/model/useFavoritesStore";
import { useCartStore } from "../../entities/cart/model/useCartStore";
import { getProductDisplayTitle } from "../../shared/lib/productTitle";
import { buildTelegramMiniAppProductLink } from "../../shared/lib/telegramMiniAppLink";
import { Button } from "../../shared/ui/Button";
import { FavoriteButton } from "../../shared/ui/FavoriteButton";
import { Page } from "../../shared/ui/Page";
import "./styles.css";

export function ItemPage() {
  const nav = useNavigate();
  const { id } = useParams();
  const productRef = String(id ?? "").trim();
  const numericProductId = Number(productRef);
  const hasNumericProductId = Number.isFinite(numericProductId);
  const { products, load, getById } = useProductsStore();
  const fav = useFavoritesStore();
  const cart = useCartStore();

  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isDescOpen, setIsDescOpen] = useState(true);
  const [isDefectsOpen, setIsDefectsOpen] = useState(true);

  useEffect(() => {
    if (!products.length) void load();
  }, [products.length, load]);

  useEffect(() => {
    void fav.load();
    void cart.load();
  }, []);

  useEffect(() => {
    const mapped = products.map((entry) => ({ id: entry.id, postId: entry.postId }));
    fav.registerCatalogItems(mapped);
    cart.registerCatalogItems(mapped);
  }, [products]);

  const product = useMemo(() => {
    if (!productRef) return undefined;

    const byPostId = products.find((entry) => String(entry.postId ?? "").trim() === productRef);
    if (byPostId) return byPostId;

    if (hasNumericProductId) {
      return getById(numericProductId);
    }

    return undefined;
  }, [productRef, products, hasNumericProductId, numericProductId, getById]);
  const isFav = useMemo(
    () => (product ? fav.has({ id: product.id, postId: product.postId }) : false),
    [fav, product],
  );
  const isInCart = useMemo(
    () => (product ? cart.has({ id: product.id, postId: product.postId }) : false),
    [cart, product],
  );
  const images = useMemo(() => (product?.images?.length ? product.images : []), [product?.images]);
  const defectImages = useMemo(() => (product?.defectImages?.length ? product.defectImages : []), [product?.defectImages]);
  const total = images.length;
  const safeIndex = total ? photoIndex % total : 0;
  const currentImage = total ? images[safeIndex] : undefined;
  const viewerTotal = viewerImages.length;
  const viewerIndex = viewerTotal ? photoIndex % viewerTotal : 0;
  const viewerImage = viewerTotal ? viewerImages[viewerIndex] : undefined;

  const hasDefectsSection = Boolean(product?.hasDefects || product?.defectsText?.trim() || defectImages.length);
  const itemHeaderTitle = useMemo(() => {
    if (!product) return "";
    const itemType = String(product.title ?? "").trim();
    const brand = String(product.brand ?? "").trim();
    if (!itemType) return brand;
    if (!brand) return itemType;
    if (itemType.toLowerCase().includes(brand.toLowerCase())) return itemType;
    return `${itemType} ${brand}`.trim();
  }, [product]);

  useEffect(() => {
    if (!isViewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsViewerOpen(false);
      if (e.key === "ArrowRight") setPhotoIndex((i) => (viewerTotal ? (i + 1) % viewerTotal : i));
      if (e.key === "ArrowLeft") setPhotoIndex((i) => (viewerTotal ? (i - 1 + viewerTotal) % viewerTotal : i));
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isViewerOpen, viewerTotal]);

  const openViewer = (list: string[], index: number) => {
    setViewerImages(list);
    setPhotoIndex(index);
    setIsViewerOpen(true);
  };

  const handlePrev = () => {
    if (!viewerTotal) return;
    setPhotoIndex((i) => (i - 1 + viewerTotal) % viewerTotal);
  };

  const handleNext = () => {
    if (!viewerTotal) return;
    setPhotoIndex((i) => (i + 1) % viewerTotal);
  };

  const goBack = () => {
    if (window.history.length > 1) nav(-1);
    else nav("/catalog");
  };

  const buildTelegramMiniAppLink = () => {
    const targetId = String(product?.postId ?? productRef).trim();
    return buildTelegramMiniAppProductLink(targetId);
  };

  const onShare = async () => {
    if (!product) return;

    const productTitle = getProductDisplayTitle(product).trim() || String(product.title ?? "").trim() || "Товар";
    const priceText = `${product.price.toLocaleString("ru-RU")} рублей`;
    const shareText = `${productTitle} ${priceText}`.trim();
    const appLink = buildTelegramMiniAppLink();
    const shareLink = appLink
      ? `https://t.me/share/url?url=${encodeURIComponent(appLink)}&text=${encodeURIComponent(shareText)}`
      : `https://t.me/share/url?text=${encodeURIComponent(shareText)}`;
    const tg = window.Telegram?.WebApp as {
      openTelegramLink?: (url: string) => void;
      switchInlineQuery?: (query: string, choose_chat_types?: string[]) => void;
    } | undefined;

    if (appLink) {
      try {
        await navigator.clipboard.writeText(appLink);
      } catch {
        // optional fallback
      }
    }

    if (typeof tg?.openTelegramLink === "function") {
      tg.openTelegramLink(shareLink);
      return;
    }

    if (typeof tg?.switchInlineQuery === "function") {
      tg.switchInlineQuery(appLink ? `${shareText} ${appLink}` : shareText, ["users", "groups", "channels"]);
      return;
    }

    window.open(shareLink, "_blank", "noopener,noreferrer");
  };

  if (!product) {
    return (
      <Page title="Товар">
        <div style={{ color: "var(--muted)" }}>Товар не найден или уже удалён.</div>
        <Button variant="secondary" onClick={goBack}>Назад</Button>
      </Page>
    );
  }

  return (
    <Page>
      <div className="item-page">
        <button type="button" className="item-back-top" onClick={goBack}>Назад</button>

        <div className="item-photo" role="button" tabIndex={0} onClick={() => openViewer(images, safeIndex)}>
          {currentImage ? <img className="item-photo__img" src={currentImage} alt={product.title} loading="lazy" /> : null}
          {total > 1 ? (
            <>
              <div className="item-photo__count">{safeIndex + 1} / {total}</div>
              <button type="button" className="item-photo__nav item-photo__nav--prev" onClick={(e) => { e.stopPropagation(); setPhotoIndex((i) => (i - 1 + total) % total); }} aria-label="Предыдущее фото">
                {"<"}
              </button>
              <button type="button" className="item-photo__nav item-photo__nav--next" onClick={(e) => { e.stopPropagation(); setPhotoIndex((i) => (i + 1) % total); }} aria-label="Следующее фото">
                {">"}
              </button>
              <div className="item-photo__dots">
                {images.map((_, i) => (
                  <span key={`${product.id}-main-dot-${i}`} className={`item-photo__dot ${i === safeIndex ? "is-on" : ""}`} />
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="item-brand">{itemHeaderTitle || "Без названия"}</div>
        <div className="item-subtitle">{product.subtitle || product.description || "Описание будет добавлено."}</div>
        <div className="item-price item-price--big">{product.price.toLocaleString("ru-RU")} ₽</div>

        <div className="item-accordion item-accordion--plain">
          <button type="button" className="item-accordion__head" onClick={() => setIsDescOpen((v) => !v)}>
            <span>Описание</span>
            <span className={`item-accordion__chevron ${isDescOpen ? "is-open" : ""}`}>
              <svg className="item-accordion__chevronIcon" viewBox="0 0 24 24" aria-hidden>
                <path d="M8 5L16 12L8 19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
          {isDescOpen ? <div className="item-accordion__body">{product.description || "Описание отсутствует."}</div> : null}
        </div>

        <div className="item-meta"><span>Состояние</span><span>{product.condition || "Не указано"}</span></div>
        <div className="item-meta"><span>Размер</span><span>{product.size || "Не указан"}</span></div>

        {hasDefectsSection ? (
          <div className="item-accordion">
            <button type="button" className="item-accordion__head" onClick={() => setIsDefectsOpen((v) => !v)}>
              <span>Дефекты</span>
              <span>{isDefectsOpen ? "−" : "+"}</span>
            </button>
            {isDefectsOpen ? (
              <div className="item-accordion__body">
                {product.defectsText?.trim() ? <div className="item-defects-text">{product.defectsText}</div> : null}
                {defectImages.length > 0 ? (
                  <div className="item-defect-grid">
                    {defectImages.map((url, index) => (
                      <button key={`${product.id}-defect-${index}`} type="button" className="item-defect-grid__btn" onClick={() => openViewer(defectImages, index)}>
                        <img src={url} alt={`Дефект ${index + 1}`} className="item-defect-grid__img" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="item-actions" role="navigation" aria-label={"\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0442\u043E\u0432\u0430\u0440\u0430"}>
          <button
            type="button"
            className="item-action-icon item-action-icon--back"
            onClick={goBack}
            aria-label={"\u041D\u0430\u0437\u0430\u0434"}
            title={"\u041D\u0430\u0437\u0430\u0434"}
          >
            <svg viewBox="0 0 46 40" aria-hidden>
              <path d="M46 20.038c0-.7-.3-1.5-.8-2.1l-16-17c-1.1-1-3.2-1.4-4.4-.3-1.2 1.1-1.2 3.3 0 4.4l11.3 11.9H3c-1.7 0-3 1.3-3 3s1.3 3 3 3h33.1l-11.3 11.9c-1 1-1.2 3.3 0 4.4 1.2 1.1 3.3.8 4.4-.3l16-17c.5-.5.8-1.1.8-1.9z" />
            </svg>
          </button>
          <Button variant="primary" className="item-action-main" onClick={() => void cart.add({ id: product.id, postId: product.postId })}>
            {isInCart
              ? "\u0412 \u043A\u043E\u0440\u0437\u0438\u043D\u0435"
              : "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 \u043A\u043E\u0440\u0437\u0438\u043D\u0443"}
          </Button>
          <FavoriteButton
            isActive={isFav}
            onToggle={() => void fav.toggle({ id: product.id, postId: product.postId })}
            className="item-action-icon"
            ariaLabel={"Избранное"}
            title={"Избранное"}
          />
          <button
            type="button"
            className="item-action-icon item-action-icon--share"
            onClick={() => void onShare()}
            aria-label={"\u041F\u0435\u0440\u0435\u0441\u043B\u0430\u0442\u044C"}
            title={"\u041F\u0435\u0440\u0435\u0441\u043B\u0430\u0442\u044C"}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path fill="none" d="M0 0h24v24H0z" />
              <path d="M13 14h-2a8.999 8.999 0 0 0-7.968 4.81A10.136 10.136 0 0 1 3 18C3 12.477 7.477 8 13 8V3l10 8-10 8v-5z" />
            </svg>
          </button>
        </div>
      </div>

      {isViewerOpen ? (
        <div className="item-viewer" onClick={() => setIsViewerOpen(false)}>
          <div className="item-viewer__content" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="item-viewer__close" onClick={() => setIsViewerOpen(false)} aria-label="Закрыть просмотр">
              <svg className="item-viewer__closeIcon" viewBox="0 0 24 24" aria-hidden>
                <path d="M6 6L18 18M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            {viewerTotal > 1 ? <div className="item-viewer__count">{viewerIndex + 1} / {viewerTotal}</div> : null}
            {viewerImage ? <img className="item-viewer__img" src={viewerImage} alt={product.title} /> : null}
            {viewerTotal > 1 ? (
              <>
                <button type="button" className="item-viewer__nav item-viewer__nav--prev" onClick={handlePrev} aria-label="Предыдущее фото">{"<"}</button>
                <button type="button" className="item-viewer__nav item-viewer__nav--next" onClick={handleNext} aria-label="Следующее фото">{">"}</button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </Page>
  );
}

export default ItemPage;
