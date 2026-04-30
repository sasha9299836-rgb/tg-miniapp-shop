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
        setErrorText(`Не удалось загрузить каталог: ${(error as Error).message}`);
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
    <Page title="Каталог" subtitle="Активные посты для редактирования">
      <div className="admin-catalog-page">
        <input
          className="admin-catalog-page__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск: название, бренд, ID, post_id"
        />

        <div className="admin-catalog-page__list">
          {isLoading ? <div className="admin-catalog-page__muted">Загрузка...</div> : null}
          {!isLoading && !filteredItems.length ? <div className="admin-catalog-page__muted">Активных постов не найдено.</div> : null}
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
                <div className="admin-catalog-page__info">Бренд: {item.brand ?? "—"}</div>
                <div className="admin-catalog-page__info">Размер: {item.size ?? "—"}</div>
                <div className="admin-catalog-page__info">Цена: {item.price.toLocaleString("ru-RU")} ₽</div>
              </div>
            </button>
          ))}
        </div>

        {errorText ? <div className="admin-catalog-page__error">{errorText}</div> : null}

        <Button variant="secondary" onClick={() => nav("/admin")}>
          Назад
        </Button>
      </div>
    </Page>
  );
}

export default AdminCatalogPage;
