import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPublishedCatalogProducts } from "../../../shared/api/adminPostsApi";
import { Button } from "../../../shared/ui/Button";
import { Page } from "../../../shared/ui/Page";
import { ProductThumb } from "../../../shared/ui/ProductThumb";
import type { Product } from "../../../shared/types/product";
import "./styles.css";

function mapSearchHaystack(item: Product): string {
  return [
    String(item.id ?? ""),
    String(item.postId ?? ""),
    item.title ?? "",
    item.brand ?? "",
    item.size ?? "",
    String(item.price ?? ""),
  ].join(" ").toLowerCase();
}

export function AdminCatalogPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setErrorText(null);
      try {
        const list = await getPublishedCatalogProducts();
        if (cancelled) return;
        setItems(list);
      } catch (error) {
        if (cancelled) return;
        setErrorText(`РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РєР°С‚Р°Р»РѕРі: ${(error as Error).message}`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => mapSearchHaystack(item).includes(normalized));
  }, [items, query]);

  return (
    <Page title="РљР°С‚Р°Р»РѕРі" subtitle="РђРєС‚РёРІРЅС‹Рµ РїРѕСЃС‚С‹ РґР»СЏ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ">
      <div className="admin-catalog-page">
        <input
          className="admin-catalog-page__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="РџРѕРёСЃРє: РЅР°Р·РІР°РЅРёРµ, Р±СЂРµРЅРґ, ID, post_id"
        />

        <div className="admin-catalog-page__list">
          {isLoading ? <div className="admin-catalog-page__muted">Р—Р°РіСЂСѓР·РєР°...</div> : null}
          {!isLoading && !filteredItems.length ? <div className="admin-catalog-page__muted">РђРєС‚РёРІРЅС‹С… РїРѕСЃС‚РѕРІ РЅРµ РЅР°Р№РґРµРЅРѕ.</div> : null}
          {filteredItems.map((item) => (
            <button
              key={String(item.postId ?? item.id)}
              type="button"
              className="admin-catalog-page__item"
              onClick={() => nav(`/admin/posts/${item.postId}/edit?from=catalog`)}
              disabled={!item.postId}
            >
              <ProductThumb
                src={item.images[0] ?? undefined}
                alt={item.title}
                className="admin-catalog-page__thumb"
                mediaClassName="admin-catalog-page__thumb-media"
              />
              <div className="admin-catalog-page__meta">
                <div className="admin-catalog-page__title">{item.title}</div>
                <div className="admin-catalog-page__info">Р‘СЂРµРЅРґ: {item.brand ?? "вЂ”"}</div>
                <div className="admin-catalog-page__info">Р Р°Р·РјРµСЂ: {item.size ?? "вЂ”"}</div>
                <div className="admin-catalog-page__info">Р¦РµРЅР°: {item.price.toLocaleString("ru-RU")} в‚Ѕ</div>
              </div>
            </button>
          ))}
        </div>

        {errorText ? <div className="admin-catalog-page__error">{errorText}</div> : null}

        <Button variant="secondary" onClick={() => nav("/admin")}>
          РќР°Р·Р°Рґ
        </Button>
      </div>
    </Page>
  );
}

export default AdminCatalogPage;
