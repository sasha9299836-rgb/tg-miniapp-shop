import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "../../../shared/ui/Page";
import { Button } from "../../../shared/ui/Button";
import { ProductThumb } from "../../../shared/ui/ProductThumb";
import { getActiveDropTeaser } from "../../../shared/api/dropTeaserApi";
import {
  clearActiveDropTeaser,
  saveActiveDropTeaser,
  uploadDropTeaserImage,
} from "../../../shared/api/adminDropTeaserApi";
import "./styles.css";

const MAX_IMAGES = 4;

export function AdminDropTeaserPage() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [shortText, setShortText] = useState("");
  const [details, setDetails] = useState("");
  const [isPublicImmediately, setIsPublicImmediately] = useState(false);
  const [currentImages, setCurrentImages] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const teaser = await getActiveDropTeaser();
        if (cancelled || !teaser) return;
        setTitle(teaser.title);
        setShortText(teaser.shortText);
        setDetails(teaser.details ?? "");
        setIsPublicImmediately(teaser.isPublicImmediately);
        setCurrentImages(teaser.previewImages.slice(0, MAX_IMAGES));
      } catch {
        if (!cancelled) {
          setCurrentImages([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPreviews = useMemo(
    () => selectedFiles.map((file) => URL.createObjectURL(file)),
    [selectedFiles],
  );

  useEffect(() => {
    return () => {
      selectedPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedPreviews]);

  const visibleImages = selectedPreviews.length ? selectedPreviews : currentImages;

  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_IMAGES);
    setSelectedFiles(files);
    setErrorText(null);
    setSuccessText(null);
  };

  const onSave = async () => {
    const normalizedTitle = title.trim();
    const normalizedShortText = shortText.trim();
    const normalizedDetails = details.trim();
    if (!normalizedTitle) {
      setErrorText("Введите заголовок анонса.");
      return;
    }
    if (!normalizedShortText) {
      setErrorText("Введите краткий текст анонса.");
      return;
    }

    setIsSaving(true);
    setErrorText(null);
    setSuccessText(null);
    try {
      let previewImages = currentImages.slice(0, MAX_IMAGES);
      if (selectedFiles.length) {
        previewImages = [];
        for (let index = 0; index < selectedFiles.length; index += 1) {
          const url = await uploadDropTeaserImage(selectedFiles[index], index + 1);
          previewImages.push(url);
        }
      }

      if (!previewImages.length) {
        throw new Error("Добавьте хотя бы одно фото превью.");
      }

      await saveActiveDropTeaser({
        title: normalizedTitle,
        short_text: normalizedShortText,
        details: normalizedDetails || null,
        preview_images: previewImages,
        is_public_immediately: isPublicImmediately,
      });

      setCurrentImages(previewImages);
      setSelectedFiles([]);
      setSuccessText("Превью сохранено и опубликовано на главной.");
    } catch (error) {
      setErrorText(`Не удалось сохранить превью: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const onClearActive = async () => {
    setIsClearing(true);
    setErrorText(null);
    setSuccessText(null);
    try {
      await clearActiveDropTeaser();
      setTitle("");
      setShortText("");
      setDetails("");
      setIsPublicImmediately(false);
      setCurrentImages([]);
      setSelectedFiles([]);
      setSuccessText("Текущее активное превью удалено.");
    } catch (error) {
      setErrorText(`Не удалось удалить текущее превью: ${(error as Error).message}`);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Page title="Добавить превью" subtitle="Загрузите до 4 фото и короткий анонс будущего дропа">
      <section className="admin-drop-teaser">
        {currentImages.length || title.trim() || shortText.trim() || details.trim() ? (
          <div className="admin-drop-teaser__active-note">Текущее активное превью загружено. Вы можете обновить или удалить его.</div>
        ) : null}

        <label className="admin-drop-teaser__label">
          Заголовок
          <input
            className="admin-drop-teaser__input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Скоро новое поступление"
          />
        </label>

        <label className="admin-drop-teaser__label">
          Краткий текст
          <textarea
            className="admin-drop-teaser__textarea"
            value={shortText}
            onChange={(event) => setShortText(event.target.value)}
            placeholder="Коротко расскажите, что будет в обновлении."
            rows={3}
          />
        </label>

        <label className="admin-drop-teaser__label">
          Детали (опционально)
          <textarea
            className="admin-drop-teaser__textarea"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Дополнительная информация для страницы анонса."
            rows={4}
          />
        </label>

        <label className="admin-drop-teaser__label">
          Фотографии превью (1-4)
          <input
            className="admin-drop-teaser__input"
            type="file"
            accept="image/*"
            multiple
            onChange={onFilesSelected}
          />
        </label>
        <label className="admin-drop-teaser__label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={isPublicImmediately}
            onChange={(event) => setIsPublicImmediately(event.target.checked)}
          />
          <span>Показать всем сразу</span>
        </label>
        {visibleImages.length ? (
          <div className={`admin-drop-teaser__gallery admin-drop-teaser__gallery--${Math.min(visibleImages.length, MAX_IMAGES)}`}>
            {visibleImages.map((image, index) => (
              <ProductThumb
                key={`preview-${index}`}
                src={image}
                alt={`Превью ${index + 1}`}
                className="admin-drop-teaser__thumb"
                mediaClassName="admin-drop-teaser__thumb-media"
              />
            ))}
          </div>
        ) : null}

        <div className="admin-drop-teaser__actions">
          <Button onClick={() => void onSave()} disabled={isSaving || isLoading || isClearing}>
            {isSaving ? "Сохраняем..." : "Сохранить"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void onClearActive()}
            disabled={isSaving || isLoading || isClearing || (!currentImages.length && !title.trim() && !shortText.trim() && !details.trim())}
          >
            {isClearing ? "Удаляем..." : "Удалить текущее превью"}
          </Button>
          <Button variant="secondary" onClick={() => nav("/admin")}>
            Назад
          </Button>
        </div>

        {errorText ? <div className="admin-drop-teaser__error">{errorText}</div> : null}
        {successText ? <div className="admin-drop-teaser__success">{successText}</div> : null}
      </section>
    </Page>
  );
}

export default AdminDropTeaserPage;
