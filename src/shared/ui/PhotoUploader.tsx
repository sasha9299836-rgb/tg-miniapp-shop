import { type ChangeEvent } from "react";
import { Button } from "./Button";
import { ProductThumb } from "./ProductThumb";
import "./photo-uploader.css";

export type PhotoPreviewItem = {
  id: string;
  photoNo: number;
  url: string;
  mediaType?: "image" | "video";
  status?: "validating" | "pending" | "uploading" | "failed" | "uploaded";
};

type Props = {
  title: string;
  inputId: string;
  selectLabel: string;
  items: PhotoPreviewItem[];
  loadingText?: string | null;
  isBusy?: boolean;
  accept?: string;
  onSelect: (files: File[]) => void;
  onRemove: (id: string) => void;
};

export function PhotoUploader({
  title,
  inputId,
  selectLabel,
  items,
  loadingText,
  isBusy = false,
  accept = "image/*",
  onSelect,
  onRemove,
}: Props) {
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;
    onSelect(files);
  };

  return (
    <div className="glass photo-uploader">
      <div className="payment-upload__title">{title}</div>
      <label className="payment-upload__label" htmlFor={inputId}>
        <svg className="payment-upload__icon" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 4v10m0 0l-4-4m4 4l4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 18h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {selectLabel}
      </label>
      <input
        id={inputId}
        className="payment-upload__input"
        type="file"
        multiple
        accept={accept}
        disabled={isBusy}
        onChange={onChange}
      />
      {loadingText ? <div className="payment-upload__file">{loadingText}</div> : null}
      {items.length > 0 ? (
        <div className="photo-uploader__list">
          {items
            .slice()
            .sort((a, b) => a.photoNo - b.photoNo)
            .map((photo) => (
              <div key={photo.id} className="photo-uploader__item">
                <div className="photo-uploader__meta">
                  {(photo.mediaType === "video" ? "Видео" : "Фото")} {photo.photoNo}
                </div>
                {photo.status && photo.status !== "uploaded" ? (
                  <div className={`photo-uploader__status ${photo.status === "failed" ? "is-failed" : ""}`}>
                    {photo.status === "validating"
                      ? "Проверяем длительность..."
                      : photo.status === "pending"
                      ? "Ожидает загрузки"
                      : photo.status === "uploading"
                      ? "Загрузка..."
                      : "Ошибка загрузки"}
                  </div>
                ) : null}
                <ProductThumb
                  src={photo.url}
                  alt={photo.mediaType === "video" ? "Видео" : "Фото"}
                  mediaType={photo.mediaType === "video" ? "video" : "image"}
                  className={`photo-uploader__thumb ${photo.mediaType === "video" ? "photo-uploader__thumb--video" : "photo-uploader__thumb--image"}`}
                  mediaClassName="photo-uploader__media"
                  controls={photo.mediaType === "video"}
                  preload="metadata"
                  playsInline
                />
                <Button variant="secondary" onClick={() => onRemove(photo.id)}>Удалить</Button>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
