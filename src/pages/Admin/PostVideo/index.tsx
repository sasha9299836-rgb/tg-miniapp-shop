import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { Page } from "../../../shared/ui/Page";
import { ProductThumb } from "../../../shared/ui/ProductThumb";
import {
  listAdminCatalogVideoItems,
  saveCatalogPostVideoLink,
  type AdminCatalogVideoItem,
} from "../../../shared/api/adminPostsApi";
import "./styles.css";

function normalizeVideoLink(raw: string): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function AdminPostVideoPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<AdminCatalogVideoItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [videoLinkInput, setVideoLinkInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  const loadItems = async () => {
    setIsLoading(true);
    setErrorText(null);
    try {
      const next = await listAdminCatalogVideoItems();
      setItems(next);
      if (selectedPostId && !next.some((entry) => entry.postId === selectedPostId)) {
        setSelectedPostId(null);
        setVideoLinkInput("");
      }
    } catch (error) {
      setErrorText(`Не удалось загрузить каталог: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => {
      const haystack = [
        String(item.id),
        item.postId,
        item.title,
        item.brand ?? "",
        item.size ?? "",
      ].join(" ").toLowerCase();
      return haystack.includes(normalized);
    });
  }, [items, query]);

  const selectedItem = useMemo(
    () => items.find((item) => item.postId === selectedPostId) ?? null,
    [items, selectedPostId],
  );

  const onSelectItem = (item: AdminCatalogVideoItem) => {
    setSelectedPostId(item.postId);
    setVideoLinkInput(item.currentVideoUrl ?? "");
    setErrorText(null);
    setSuccessText(null);
  };

  const onSave = async () => {
    if (!selectedItem) {
      setErrorText("Сначала выберите вещь из списка.");
      return;
    }
    const trimmed = videoLinkInput.trim();
    const normalized = normalizeVideoLink(trimmed);
    if (trimmed && !normalized) {
      setErrorText("Укажите корректную https-ссылку на видео.");
      return;
    }

    setIsSaving(true);
    setErrorText(null);
    setSuccessText(null);
    try {
      await saveCatalogPostVideoLink(selectedItem.postId, normalized);
      await loadItems();
      setVideoLinkInput(normalized ?? "");
      setSuccessText(normalized ? "Ссылка на видео сохранена." : "Видео удалено из поста.");
    } catch (error) {
      setErrorText(`Не удалось сохранить ссылку: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Page title="Добавить видео в пост" subtitle="Выберите вещь и сохраните ссылку на видео">
      <div className="admin-post-video-page">
        <input
          className="admin-post-video-page__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по id / post_id / названию / бренду"
        />

        <div className="admin-post-video-page__list">
          {isLoading ? <div className="admin-post-video-page__muted">Загрузка каталога...</div> : null}
          {!isLoading && !filteredItems.length ? <div className="admin-post-video-page__muted">Ничего не найдено.</div> : null}
          {filteredItems.map((item) => (
            <button
              key={item.postId}
              type="button"
              className={`admin-post-video-page__item ${item.postId === selectedPostId ? "is-active" : ""}`}
              onClick={() => onSelectItem(item)}
            >
              <ProductThumb
                src={item.previewUrl ?? undefined}
                alt={item.title}
                className="admin-post-video-page__thumb"
                mediaClassName="admin-post-video-page__thumb-media"
              />
              <div className="admin-post-video-page__meta">
                <div className="admin-post-video-page__title">{item.title}</div>
                <div className="admin-post-video-page__info">ID: {item.id} · post_id: {item.postId}</div>
                <div className="admin-post-video-page__info">{item.brand ?? "Без бренда"} · {item.size ?? "Без размера"}</div>
              </div>
            </button>
          ))}
        </div>

        {selectedItem ? (
          <div className="glass admin-post-video-page__form">
            <div className="admin-post-video-page__form-title">Выбрано: {selectedItem.title}</div>
            <div className="admin-post-video-page__current">
              Текущая ссылка: {selectedItem.currentVideoUrl ?? "не задана"}
            </div>
            <input
              className="admin-post-video-page__input"
              value={videoLinkInput}
              onChange={(event) => setVideoLinkInput(event.target.value)}
              placeholder="https://..."
            />
            <div className="admin-post-video-page__actions">
              <Button onClick={() => void onSave()} disabled={isSaving}>
                {isSaving ? "Сохраняем..." : "Сохранить"}
              </Button>
              <Button variant="secondary" onClick={() => nav("/admin")}>
                Назад
              </Button>
            </div>
          </div>
        ) : null}

        {errorText ? <div className="admin-post-video-page__error">{errorText}</div> : null}
        {successText ? <div className="admin-post-video-page__success">{successText}</div> : null}
      </div>
    </Page>
  );
}

export default AdminPostVideoPage;
