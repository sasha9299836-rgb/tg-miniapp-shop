import { memo, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import type { Product } from "../../shared/types/product";
import { FavoriteButton } from "../../shared/ui/FavoriteButton";
import { ProductThumb } from "../../shared/ui/ProductThumb";
import { getProductDisplayTitle } from "../../shared/lib/productTitle";
import "./styles.css";

function ProductCardInner({
  product,
  onOpen,
  onAddToCart,
  onRemoveFromCart,
  onToggleFav,
  isFav,
  isInCart,
}: {
  product: Product;
  onOpen: () => void;
  onAddToCart: () => void;
  onRemoveFromCart: () => void;
  onToggleFav: () => void;
  isFav: boolean;
  isInCart: boolean;
}) {
  const images = useMemo(() => (product.images?.length ? product.images : []), [product.images]);
  const total = images.length;
  const [index, setIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [cartPulse, setCartPulse] = useState(false);
  const dragRef = useRef({ down: false, startX: 0, moved: false });
  const touchRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    horizontal: false,
  });

  const safeIndex = total ? index % total : 0;
  const current = total ? images[safeIndex] : undefined;
  const showOldPrice = typeof product.oldPrice === "number" && product.oldPrice > product.price;
  const discountPercent = useMemo(() => {
    if (!showOldPrice || typeof product.oldPrice !== "number") return null;
    const percent = Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100);
    return percent > 0 ? percent : null;
  }, [product.oldPrice, product.price, showOldPrice]);
  const cardTitle = useMemo(() => getProductDisplayTitle(product), [product]);
  const sizeText = useMemo(() => String(product.size ?? "").trim(), [product.size]);

  const setSlide = (next: number) => {
    if (!total) return;
    const normalized = (next + total) % total;
    if (normalized === safeIndex) return;
    setIndex(normalized);
  };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSlide(safeIndex - 1);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSlide(safeIndex + 1);
  };

  const handleOpen = () => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    onOpen();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    if (!total) return;
    dragRef.current.down = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.moved = false;
    setIsActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    if (!dragRef.current.down) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 6) dragRef.current.moved = true;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    if (!dragRef.current.down) return;
    dragRef.current.down = false;
    setIsActive(false);
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 32) {
      if (dx > 0) handlePrev();
      else handleNext();
    }
  };

  const onPointerCancel = () => {
    dragRef.current.down = false;
    setIsActive(false);
  };

  const onTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!total || e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      horizontal: false,
    };
    setIsActive(true);
  };

  const onTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!touchRef.current.active || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchRef.current.startX;
    const dy = touch.clientY - touchRef.current.startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
      touchRef.current.horizontal = true;
    }
  };

  const onTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (!touchRef.current.active) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchRef.current.startX;
    const shouldSwipe = touchRef.current.horizontal && Math.abs(dx) > 32;
    touchRef.current.active = false;
    setIsActive(false);
    if (!shouldSwipe) return;
    dragRef.current.moved = true;
    if (dx > 0) handlePrev();
    else handleNext();
  };

  const onTouchCancel = () => {
    touchRef.current.active = false;
    setIsActive(false);
  };

  const handleCartClick = () => {
    if (isInCart) onRemoveFromCart();
    else onAddToCart();
    setCartPulse(true);
    window.setTimeout(() => setCartPulse(false), 360);
  };

  return (
    <div className="pcard">
      <div
        className={`pcard__imgWrap ${isActive ? "is-active" : ""}`}
        onClick={handleOpen}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerCancel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        role="button"
        tabIndex={0}
      >
        {total > 0 ? (
          <div className="pcard__viewport">
            <div
              className="pcard__track"
              style={{ transform: `translateX(-${safeIndex * 100}%)` }}
            >
              {images.map((imageSrc, imageIndex) => (
                <div className="pcard__slide" key={`${product.id}-slide-${imageIndex}`}>
                  <ProductThumb
                    className="pcard__thumb"
                    mediaClassName="pcard__img"
                    src={imageSrc}
                    alt={product.title}
                    variant="card"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ProductThumb
            className="pcard__thumb"
            mediaClassName="pcard__img"
            src={current}
            alt={product.title}
            variant="card"
            loading="lazy"
            decoding="async"
          />
        )}

        {total > 0 ? (
          <>
            {total > 1 ? (
              <>
                <div className="pcard__count">{safeIndex + 1} / {total}</div>
                <button type="button" className="pcard__nav pcard__nav--prev" onClick={handlePrev}>
                  <svg viewBox="0 0 24 24" aria-hidden style={{ width: 14, height: 14, transform: "rotate(180deg)" }}>
                    <path d="M8 5L16 12L8 19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button type="button" className="pcard__nav pcard__nav--next" onClick={handleNext}>
                  <svg viewBox="0 0 24 24" aria-hidden style={{ width: 14, height: 14 }}>
                    <path d="M8 5L16 12L8 19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </>
            ) : null}
            <div className="pcard__dots">
              {images.map((_, i) => (
                <span key={`${product.id}-dot-${i}`} className={`pcard__dot ${i === safeIndex ? "is-on" : ""}`} />
              ))}
            </div>
          </>
        ) : null}

        {discountPercent != null ? <span className="pcard__discountBadge">{`-${discountPercent}%`}</span> : null}
        {product.isNew ? <span className={`pcard__badge ${discountPercent != null ? "pcard__badge--with-discount" : ""}`.trim()}>NEW</span> : null}
      </div>

      <div className="pcard__body" onClick={handleOpen} role="button" tabIndex={0}>
        <div className="pcard__title">{cardTitle}</div>
        {sizeText ? <div className="pcard__size">{`Размер: ${sizeText}`}</div> : null}
        <div className="pcard__priceRow">
          <div className="pcard__price">{product.price.toLocaleString("ru-RU")} ₽</div>
          {showOldPrice ? (
            <div className="pcard__priceOld">{product.oldPrice?.toLocaleString("ru-RU")} ₽</div>
          ) : null}
        </div>
      </div>

      <div className="pcard__actions">
        <button
          type="button"
          className={`pcard__cartWide ${isInCart ? "is-on" : ""} ${cartPulse ? "is-animate" : ""}`}
          onClick={handleCartClick}
          aria-label="Добавить в корзину"
        >
          <svg className="pcard__cartIcon" viewBox="0 0 24 24" aria-hidden>
            <path d="M7 6h13l-1.6 8.5a2 2 0 0 1-2 1.6H9a2 2 0 0 1-2-1.6L5.5 4H3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="10" cy="19" r="1.5" fill="currentColor" />
            <circle cx="17" cy="19" r="1.5" fill="currentColor" />
          </svg>
        </button>

        <FavoriteButton
          isActive={isFav}
          onToggle={onToggleFav}
          className="pcard__iconButton pcard__fav"
          ariaLabel={"Избранное"}
          title={"Избранное"}
        />
      </div>
    </div>
  );
}

export const ProductCard = memo(
  ProductCardInner,
  (prev, next) =>
    prev.product === next.product &&
    prev.isFav === next.isFav &&
    prev.isInCart === next.isInCart,
);

export default ProductCard;
