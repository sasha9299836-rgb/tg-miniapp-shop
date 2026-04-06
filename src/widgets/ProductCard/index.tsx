import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Product } from "../../shared/types/product";
import { FavoriteButton } from "../../shared/ui/FavoriteButton";
import "./styles.css";

export function ProductCard({
  product,
  onOpen,
  onAddToCart,
  onToggleFav,
  isFav,
  isInCart,
}: {
  product: Product;
  onOpen: () => void;
  onAddToCart: () => void;
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

  const safeIndex = total ? index % total : 0;
  const current = total ? images[safeIndex] : undefined;
  const showOldPrice = typeof product.oldPrice === "number" && product.oldPrice > product.price;
  const cardTitle = useMemo(() => {
    const title = String(product.title ?? "").trim();
    const brand = String(product.brand ?? "").trim();
    if (!brand) return title;
    if (title.toLowerCase().includes(brand.toLowerCase())) return title;
    return `${title} ${brand}`.trim();
  }, [product.brand, product.title]);

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
    if (!total) return;
    dragRef.current.down = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.moved = false;
    setIsActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.down) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 6) dragRef.current.moved = true;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
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

  const handleCartClick = () => {
    onAddToCart();
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
        role="button"
        tabIndex={0}
      >
        {current ? (
          <img
            className="pcard__img"
            src={current}
            alt={product.title}
            width={720}
            height={360}
            loading="lazy"
            decoding="async"
          />
        ) : null}

        {total > 0 ? (
          <>
            {total > 1 ? (
              <>
                <div className="pcard__count">{safeIndex + 1} / {total}</div>
                <button type="button" className="pcard__nav pcard__nav--prev" onClick={handlePrev}>
                  {"<"}
                </button>
                <button type="button" className="pcard__nav pcard__nav--next" onClick={handleNext}>
                  {">"}
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

        {product.isNew ? <span className="pcard__badge">Новое</span> : null}
      </div>

      <div className="pcard__body" onClick={handleOpen} role="button" tabIndex={0}>
        <div className="pcard__title">{cardTitle}</div>
        <div className="pcard__priceRow">
          <div className="pcard__price">{product.price.toLocaleString("ru-RU")}₽</div>
          {showOldPrice ? (
            <div className="pcard__priceOld">{product.oldPrice?.toLocaleString("ru-RU")}₽</div>
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
          ariaLabel={"\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435"}
          title={"\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435"}
        />
      </div>
    </div>
  );
}

export default ProductCard;
