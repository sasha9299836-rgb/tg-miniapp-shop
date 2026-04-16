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

  const dropDateText = useMemo(() => formatDropDate(teaser?.dropDate ?? null), [teaser?.dropDate]);

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

  return (
    <Page title="Скоро новый дроп" subtitle="Смотрите заранее, что появится в обновлении.">
      <section className="drop-preview-card">
        <div className="drop-preview-card__title">{teaser.title}</div>
        <div className="drop-preview-card__text">{teaser.shortText}</div>

        {teaser.previewImages.length ? (
          <div className="drop-preview-card__gallery">
            {teaser.previewImages.map((image, index) => (
              <ProductThumb
                key={`${teaser.id}-preview-${index}`}
                src={image}
                alt={`Превью ${index + 1}`}
                className="drop-preview-card__thumb"
                mediaClassName="drop-preview-card__thumb-media"
              />
            ))}
          </div>
        ) : null}

        <div className="drop-preview-card__meta">
          {teaser.itemCount != null ? <div>Планируется вещей: {teaser.itemCount}</div> : null}
          {dropDateText ? <div>Дата дропа: {dropDateText}</div> : null}
        </div>

        {teaser.details ? <div className="drop-preview-card__details">{teaser.details}</div> : null}

        {teaser.highlights.length ? (
          <ul className="drop-preview-card__highlights">
            {teaser.highlights.map((item, index) => (
              <li key={`${teaser.id}-hl-${index}`}>{item}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </Page>
  );
}

export default DropPreviewPage;
