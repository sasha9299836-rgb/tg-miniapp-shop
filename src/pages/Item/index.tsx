import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProductsStore } from "../../entities/product/model/useProductsStore";
import { useFavoritesStore } from "../../entities/favorites/model/useFavoritesStore";
import { Button } from "../../shared/ui/Button";
import { Page } from "../../shared/ui/Page";
import "./styles.css";

export function ItemPage() {
  const nav = useNavigate();
  const { id } = useParams();
  const productId = Number(id);
  const { products, load, getById } = useProductsStore();
  const fav = useFavoritesStore();

  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isDescOpen, setIsDescOpen] = useState(true);
  const [isDefectsOpen, setIsDefectsOpen] = useState(true);

  useEffect(() => {
    if (!products.length) void load();
  }, [products.length, load]);

  const product = getById(productId);
  const isFav = useMemo(() => (product ? fav.has(product.id) : false), [fav, product]);
  const images = useMemo(() => (product?.images?.length ? product.images : []), [product?.images]);
  const defectImages = useMemo(() => (product?.defectImages?.length ? product.defectImages : []), [product?.defectImages]);
  const total = images.length;
  const safeIndex = total ? photoIndex % total : 0;
  const currentImage = total ? images[safeIndex] : undefined;
  const viewerTotal = viewerImages.length;
  const viewerIndex = viewerTotal ? photoIndex % viewerTotal : 0;
  const viewerImage = viewerTotal ? viewerImages[viewerIndex] : undefined;

  const hasDefectsSection = Boolean(product?.hasDefects || product?.defectsText?.trim() || defectImages.length);

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

        <div className="item-brand">{product.brand || "Без бренда"}</div>
        <div className="item-subtitle">{product.subtitle || product.description || "Описание будет добавлено."}</div>
        <div className="item-price item-price--big">{product.price.toLocaleString("ru-RU")} ₽</div>

        <div className="item-accordion item-accordion--plain">
          <button type="button" className="item-accordion__head" onClick={() => setIsDescOpen((v) => !v)}>
            <span>Описание</span>
            <span className={`item-accordion__chevron ${isDescOpen ? "is-open" : ""}`}>{">"}</span>
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

        <div className="item-actions" role="navigation" aria-label="Действия товара">
          <Button variant="secondary" className="item-action" onClick={goBack}>Назад</Button>
          <Button variant="secondary" className="item-action" onClick={() => nav("/cart")}>Корзина</Button>
          <Button variant="secondary" className="item-action" onClick={() => fav.toggle(product.id)}>
            {isFav ? "В избранном" : "Добавить в избранное"}
          </Button>
          <Button variant="primary" className="item-action" onClick={() => nav("/checkout")}>Оформление</Button>
        </div>
      </div>

      {isViewerOpen ? (
        <div className="item-viewer" onClick={() => setIsViewerOpen(false)}>
          <div className="item-viewer__content" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="item-viewer__close" onClick={() => setIsViewerOpen(false)} aria-label="Закрыть просмотр">×</button>
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
