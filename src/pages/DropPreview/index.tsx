import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "../../shared/ui/Page";
import { Button } from "../../shared/ui/Button";
import { ProductThumb } from "../../shared/ui/ProductThumb";
import { getActiveDropTeaser, type DropTeaser } from "../../shared/api/dropTeaserApi";
import "./styles.css";

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

  const previewImages = useMemo(
    () => teaser?.previewImages.slice(0, 4) ?? [],
    [teaser?.previewImages],
  );

  const dropDateText = useMemo(() => formatDropDate(teaser?.dropDate ?? null), [teaser?.dropDate]);
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
            <ProductThumb
              src={viewerImage}
              alt={`Превью ${safeViewerIndex + 1}`}
              className="drop-preview-viewer__thumb"
              mediaClassName="drop-preview-viewer__img"
              loading="eager"
              decoding="sync"
            />
            {viewerTotal > 1 ? (
              <>
                <button
                  type="button"
                  className="drop-preview-viewer__nav drop-preview-viewer__nav--prev"
                  onClick={handlePrev}
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
