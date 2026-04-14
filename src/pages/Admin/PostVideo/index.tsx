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
      setErrorText(`РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РєР°С‚Р°Р»РѕРі: ${(error as Error).message}`);
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
        item.title,
        item.brand ?? "",
        item.size ?? "",
        String(item.price ?? ""),
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
    setVideoLinkInput("");
    setErrorText(null);
    setSuccessText(null);
  };

  const onSave = async () => {
    if (!selectedItem) {
      setErrorText("РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРёС‚Рµ РІРµС‰СЊ РёР· СЃРїРёСЃРєР°.");
      return;
    }
    const trimmed = videoLinkInput.trim();
    const normalized = normalizeVideoLink(trimmed);
    if (trimmed && !normalized) {
      setErrorText("РЈРєР°Р¶РёС‚Рµ РєРѕСЂСЂРµРєС‚РЅСѓСЋ https-СЃСЃС‹Р»РєСѓ РЅР° РІРёРґРµРѕ.");
      return;
    }

    setIsSaving(true);
    setErrorText(null);
    setSuccessText(null);
    try {
      await saveCatalogPostVideoLink(selectedItem.postId, normalized);
      await loadItems();
      setVideoLinkInput(normalized ?? "");
      setSuccessText(normalized ? "РЎСЃС‹Р»РєР° РЅР° РІРёРґРµРѕ СЃРѕС…СЂР°РЅРµРЅР°." : "Р’РёРґРµРѕ СѓРґР°Р»РµРЅРѕ РёР· РїРѕСЃС‚Р°.");
    } catch (error) {
      setErrorText(`РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ СЃСЃС‹Р»РєСѓ: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Page title="Р”РѕР±Р°РІРёС‚СЊ РІРёРґРµРѕ РІ РїРѕСЃС‚" subtitle="Р’С‹Р±РµСЂРёС‚Рµ РІРµС‰СЊ Рё СЃРѕС…СЂР°РЅРёС‚Рµ СЃСЃС‹Р»РєСѓ РЅР° РІРёРґРµРѕ">
      <div className="admin-post-video-page">
        <input
          className="admin-post-video-page__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск"
        />

        <div className="admin-post-video-page__list">
          {isLoading ? <div className="admin-post-video-page__muted">Р—Р°РіСЂСѓР·РєР° РєР°С‚Р°Р»РѕРіР°...</div> : null}
          {!isLoading && !filteredItems.length ? <div className="admin-post-video-page__muted">РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ.</div> : null}
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
                {item.id != null ? <div className="admin-post-video-page__info">ID: {item.id}</div> : null}
                <div className="admin-post-video-page__info">Бренд: {item.brand ?? "Без бренда"}</div>
                <div className="admin-post-video-page__info">Размер: {item.size ?? "Без размера"}</div>
                <div className="admin-post-video-page__info">Цена: {item.price.toLocaleString("ru-RU")} ₽</div>
              </div>
            </button>
          ))}
        </div>

        {selectedItem ? (
          <div className="glass admin-post-video-page__form">
            <div className="admin-post-video-page__form-title">Р’С‹Р±СЂР°РЅРѕ: {selectedItem.title}</div>
            <input
              className="admin-post-video-page__input"
              value={videoLinkInput}
              onChange={(event) => setVideoLinkInput(event.target.value)}
              placeholder="https://..."
            />
            <div className="admin-post-video-page__actions">
              <Button onClick={() => void onSave()} disabled={isSaving}>
                {isSaving ? "РЎРѕС…СЂР°РЅСЏРµРј..." : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
              </Button>
              <Button variant="secondary" onClick={() => nav("/admin")}>
                РќР°Р·Р°Рґ
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

