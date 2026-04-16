import { useEffect, useRef, useState, type TouchEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "../../shared/ui/Page";
import { Button } from "../../shared/ui/Button";
import { ProductThumb } from "../../shared/ui/ProductThumb";
import { getActiveDropTeaser, type DropTeaser } from "../../shared/api/dropTeaserApi";
import "./styles.css";

type PinchZoomImageProps = {
  src?: string;
  alt: string;
  wrapperClassName: string;
  imageClassName: string;
  onZoomStateChange?: (isZoomed: boolean) => void;
};

function getTouchDistance(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) {
  const dx = b.clientX - a.clientX;
  const dy = b.clientY - a.clientY;
  return Math.hypot(dx, dy);
}

function PinchZoomImage({ src, alt, wrapperClassName, imageClassName, onZoomStateChange }: PinchZoomImageProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pinchStateRef = useRef<{
    startDistance: number;
    startScale: number;
    startMidpointX: number;
    startMidpointY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  const clampOffset = (next: { x: number; y: number }, targetScale: number) => {
    const container = containerRef.current;
    if (!container || targetScale <= 1) return { x: 0, y: 0 };
    const maxX = (container.clientWidth * (targetScale - 1)) / 2;
    const maxY = (container.clientHeight * (targetScale - 1)) / 2;
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };

  const resetZoom = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setOrigin({ x: 50, y: 50 });
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      const touchA = event.touches[0];
      const touchB = event.touches[1];
      const midpointX = (touchA.clientX + touchB.clientX) / 2;
      const midpointY = (touchA.clientY + touchB.clientY) / 2;
      const rect = containerRef.current?.getBoundingClientRect();
      if (scale <= 1.01 && rect && rect.width > 0 && rect.height > 0) {
        const originX = ((midpointX - rect.left) / rect.width) * 100;
        const originY = ((midpointY - rect.top) / rect.height) * 100;
        setOrigin({
          x: Math.min(100, Math.max(0, originX)),
          y: Math.min(100, Math.max(0, originY)),
        });
      }
      pinchStateRef.current = {
        startDistance: getTouchDistance(touchA, touchB),
        startScale: scale,
        startMidpointX: midpointX,
        startMidpointY: midpointY,
        startOffsetX: offset.x,
        startOffsetY: offset.y,
      };
      panStartRef.current = null;
      return;
    }

    if (event.touches.length === 1 && scale > 1) {
      const touch = event.touches[0];
      panStartRef.current = { x: touch.clientX, y: touch.clientY, offsetX: offset.x, offsetY: offset.y };
    }
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && pinchStateRef.current) {
      event.preventDefault();
      const touchA = event.touches[0];
      const touchB = event.touches[1];
      const currentDistance = getTouchDistance(touchA, touchB);
      const currentMidpointX = (touchA.clientX + touchB.clientX) / 2;
      const currentMidpointY = (touchA.clientY + touchB.clientY) / 2;
      if (currentDistance > 0) {
        const nextScale = Math.min(4, Math.max(1, pinchStateRef.current.startScale * (currentDistance / pinchStateRef.current.startDistance)));
        const shiftedOffset = {
          x: pinchStateRef.current.startOffsetX + (currentMidpointX - pinchStateRef.current.startMidpointX),
          y: pinchStateRef.current.startOffsetY + (currentMidpointY - pinchStateRef.current.startMidpointY),
        };
        setScale(nextScale);
        setOffset(clampOffset(shiftedOffset, nextScale));
      }
      return;
    }

    if (event.touches.length === 1 && panStartRef.current && scale > 1) {
      event.preventDefault();
      const touch = event.touches[0];
      const nextX = panStartRef.current.offsetX + (touch.clientX - panStartRef.current.x);
      const nextY = panStartRef.current.offsetY + (touch.clientY - panStartRef.current.y);
      setOffset(clampOffset({ x: nextX, y: nextY }, scale));
    }
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) pinchStateRef.current = null;
    if (event.touches.length === 0) panStartRef.current = null;
    if (scale <= 1.01) resetZoom();
  };

  useEffect(() => {
    onZoomStateChange?.(scale > 1.01);
  }, [onZoomStateChange, scale]);

  useEffect(() => () => onZoomStateChange?.(false), [onZoomStateChange]);

  return (
    <div
      ref={containerRef}
      className={`${wrapperClassName} ${scale > 1 ? "is-zoomed" : ""}`.trim()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="drop-preview-zoom-content"
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          transformOrigin: `${origin.x}% ${origin.y}%`,
        }}
      >
        {src ? (
          <img className={imageClassName} src={src} alt={alt} draggable={false} />
        ) : null}
      </div>
    </div>
  );
}

function formatDropDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function DropPreviewPage() {
  const nav = useNavigate();
  const [teaser, setTeaser] = useState<DropTeaser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [isViewerPhotoZoomed, setIsViewerPhotoZoomed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await getActiveDropTeaser();
        if (!cancelled) setTeaser(loaded);
      } catch (error) {
        if (!cancelled) setErrorText(`Не удалось загрузить превью: ${(error as Error).message}`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const previewImages = teaser?.previewImages.slice(0, 4) ?? [];
  const dropDateText = formatDropDate(teaser?.dropDate ?? null);
  const viewerTotal = previewImages.length;
  const safeViewerIndex = viewerTotal ? ((viewerIndex % viewerTotal) + viewerTotal) % viewerTotal : 0;
  const viewerImage = viewerTotal ? previewImages[safeViewerIndex] : null;

  useEffect(() => {
    if (!isViewerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsViewerOpen(false);
      if (event.key === "ArrowRight") setViewerIndex((index) => (viewerTotal ? (index + 1) % viewerTotal : index));
      if (event.key === "ArrowLeft") setViewerIndex((index) => (viewerTotal ? (index - 1 + viewerTotal) % viewerTotal : index));
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isViewerOpen, viewerTotal]);

  useEffect(() => {
    if (!isViewerOpen) {
      setIsViewerPhotoZoomed(false);
    }
  }, [isViewerOpen]);

  if (isLoading) {
    return (
      <Page title="Скоро новый дроп" subtitle="Загрузка превью...">
        <div />
      </Page>
    );
  }

  if (errorText) {
    return (
      <Page title="Скоро новый дроп" subtitle="Превью временно недоступно.">
        <div className="drop-preview__error">{errorText}</div>
        <Button variant="secondary" onClick={() => nav("/")}>На главную</Button>
      </Page>
    );
  }

  if (!teaser) {
    return (
      <Page title="Скоро новый дроп" subtitle="Сейчас активного превью нет.">
        <Button variant="secondary" onClick={() => nav("/")}>На главную</Button>
      </Page>
    );
  }

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setIsViewerOpen(true);
  };

  const handlePrev = () => {
    if (!viewerTotal) return;
    setViewerIndex((index) => (index - 1 + viewerTotal) % viewerTotal);
  };

  const handleNext = () => {
    if (!viewerTotal) return;
    setViewerIndex((index) => (index + 1) % viewerTotal);
  };

  return (
    <Page title="Скоро новый дроп" subtitle="Смотрите заранее, что появится в обновлении.">
      <section className="drop-preview-card">
        <div className="drop-preview-card__title">{teaser.title}</div>
        <div className="drop-preview-card__text">{teaser.shortText}</div>

        {previewImages.length ? (
          <div className={`drop-preview-card__gallery drop-preview-card__gallery--${Math.min(previewImages.length, 4)}`}>
            {previewImages.map((image, index) => (
              <button
                key={`${teaser.id}-preview-${index}`}
                type="button"
                className="drop-preview-card__thumb"
                onClick={() => openViewer(index)}
              >
                <ProductThumb
                  src={image}
                  alt={`Превью ${index + 1}`}
                  mediaClassName="drop-preview-card__thumb-media"
                />
              </button>
            ))}
          </div>
        ) : null}

        {dropDateText ? (
          <div className="drop-preview-card__meta">
            <div>Дата дропа: {dropDateText}</div>
          </div>
        ) : null}

        {teaser.details ? <div className="drop-preview-card__details">{teaser.details}</div> : null}

        {teaser.highlights.length ? (
          <ul className="drop-preview-card__highlights">
            {teaser.highlights.map((item, index) => (
              <li key={`${teaser.id}-hl-${index}`}>{item}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <Button variant="secondary" className="drop-preview__back-btn" onClick={() => nav(-1)}>
        Назад
      </Button>

      {isViewerOpen && viewerImage ? (
        <div className="drop-preview-viewer" onClick={() => setIsViewerOpen(false)}>
          <div className="drop-preview-viewer__content" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="drop-preview-viewer__close"
              onClick={() => setIsViewerOpen(false)}
              aria-label="Закрыть просмотр"
            >
              <svg className="drop-preview-viewer__closeIcon" viewBox="0 0 24 24" aria-hidden>
                <path d="M6 6L18 18M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            {viewerTotal > 1 ? <div className="drop-preview-viewer__count">{safeViewerIndex + 1} / {viewerTotal}</div> : null}
            <PinchZoomImage
              src={viewerImage ?? undefined}
              alt={`Превью ${safeViewerIndex + 1}`}
              wrapperClassName="drop-preview-viewer__thumb"
              imageClassName="drop-preview-viewer__img"
              onZoomStateChange={setIsViewerPhotoZoomed}
            />
            {viewerTotal > 1 ? (
              <>
                <button
                  type="button"
                  className="drop-preview-viewer__nav drop-preview-viewer__nav--prev"
                  onClick={handlePrev}
                  disabled={isViewerPhotoZoomed}
                  aria-label="Предыдущее фото"
                >
                  <svg viewBox="0 0 24 24" aria-hidden style={{ width: 14, height: 14, transform: "rotate(180deg)" }}>
                    <path d="M8 5L16 12L8 19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="drop-preview-viewer__nav drop-preview-viewer__nav--next"
                  onClick={handleNext}
                  disabled={isViewerPhotoZoomed}
                  aria-label="Следующее фото"
                >
                  <svg viewBox="0 0 24 24" aria-hidden style={{ width: 14, height: 14 }}>
                    <path d="M8 5L16 12L8 19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </Page>
  );
}

export default DropPreviewPage;
