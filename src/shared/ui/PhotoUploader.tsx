import { type ChangeEvent } from "react";
import { Button } from "./Button";

export type PhotoPreviewItem = {
  id: string;
  photoNo: number;
  url: string;
  mediaType?: "image" | "video";
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
    <div className="glass" style={{ padding: 12, display: "grid", gap: 8 }}>
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
        <div style={{ display: "grid", gap: 8 }}>
          {items
            .slice()
            .sort((a, b) => a.photoNo - b.photoNo)
            .map((photo) => (
              <div key={photo.id} style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>{photo.mediaType === "video" ? "Видео" : "Фото"} {photo.photoNo}</div>
                {photo.mediaType === "video" ? (
                  <video
                    src={photo.url}
                    controls
                    preload="metadata"
                    playsInline
                    style={{ width: 160, maxWidth: "100%", borderRadius: 8, background: "#000" }}
                  />
                ) : (
                  <img src={photo.url} alt="Фотография" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8 }} />
                )}
                <Button variant="secondary" onClick={() => onRemove(photo.id)}>Удалить</Button>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
