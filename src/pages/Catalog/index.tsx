import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProductsStore } from "../../entities/product/model/useProductsStore";
import { useFavoritesStore } from "../../entities/favorites/model/useFavoritesStore";
import { useCartStore } from "../../entities/cart/model/useCartStore";
import { useDefectReviewStore } from "../../entities/cart/model/useDefectReviewStore";
import { ProductCard } from "../../widgets/ProductCard";
import { Input } from "../../shared/ui/Input";
import { Button } from "../../shared/ui/Button";
import { Page } from "../../shared/ui/Page";
import "./styles.css";

export function CatalogPage() {
  const nav = useNavigate();
  const { products, load } = useProductsStore();
  const favoritePostIds = useFavoritesStore((s) => s.postIds);
  const loadFavorites = useFavoritesStore((s) => s.load);
  const registerFavoriteCatalogItems = useFavoritesStore((s) => s.registerCatalogItems);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const hasFavorite = useFavoritesStore((s) => s.has);
  const cartItems = useCartStore((s) => s.items);
  const loadCart = useCartStore((s) => s.load);
  const registerCartCatalogItems = useCartStore((s) => s.registerCatalogItems);
  const hasInCart = useCartStore((s) => s.has);
  const removeFromCart = useCartStore((s) => s.remove);
  const requestAddWithDefectGuard = useDefectReviewStore((s) => s.requestAddWithDefectGuard);

  const [q, setQ] = useState("");
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [newOnly, setNewOnly] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    void loadFavorites();
    void loadCart();
  }, [loadFavorites, loadCart]);

  useEffect(() => {
    const mapped = products.map((product) => ({ id: product.id, postId: product.postId }));
    registerFavoriteCatalogItems(mapped);
    registerCartCatalogItems(mapped);
  }, [products, registerFavoriteCatalogItems, registerCartCatalogItems]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const product of products) {
      const value = String(product.title ?? "").trim();
      if (!value) continue;
      set.add(value);
    }
    return Array.from(set);
  }, [products]);

  const sizeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const product of products) {
      const value = String(product.size ?? "").trim();
      if (!value) continue;
      set.add(value);
    }
    return Array.from(set);
  }, [products]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => {
      if (s && !p.title.toLowerCase().includes(s)) return false;
      if (typeFilter && String(p.title ?? "").trim() !== typeFilter) return false;
      if (sizeFilter && String(p.size ?? "").trim() !== sizeFilter) return false;
      if (newOnly && !p.isNew) return false;
      return true;
    });
  }, [products, q, typeFilter, sizeFilter, newOnly]);
  const favoritePostIdsSet = useMemo(() => new Set(favoritePostIds), [favoritePostIds]);
  const cartPostIdsSet = useMemo(
    () => new Set(cartItems.map((item) => String(item.postId ?? "").trim()).filter(Boolean)),
    [cartItems],
  );

  return (
    <Page title="Каталог">
      <div className="catalog-page">
        <div className="catalog-search">
          <Input placeholder="Поиск по каталогу..." value={q} onChange={(e) => setQ(e.target.value)} />
          <Button variant="secondary" style={{ width: "auto" }} onClick={() => setIsFiltersOpen((v) => !v)}>
            Фильтры
          </Button>
        </div>

        {isFiltersOpen ? (
          <div className="catalog-filters">
            <div className="catalog-filters__title">Фильтры</div>
            <div className="catalog-filters__options">
              <label className="catalog-filters__field">
                <span className="catalog-filters__label">Тип вещи</span>
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="catalog-filters__select">
                  <option value="">Все</option>
                  {typeOptions.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="catalog-filters__field">
                <span className="catalog-filters__label">Размер</span>
                <select value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)} className="catalog-filters__select">
                  <option value="">Все</option>
                  {sizeOptions.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="catalog-filters__checkbox">
                <input type="checkbox" checked={newOnly} onChange={(event) => setNewOnly(event.target.checked)} />
                <span>Новинки</span>
              </label>
            </div>
            <Button variant="secondary" onClick={() => setIsFiltersOpen(false)}>Закрыть</Button>
          </div>
        ) : null}

        <div className="catalog-grid">
          {filtered.map((p) => (
            <ProductCard
              key={p.postId ?? `id:${p.id}`}
              product={p}
              onOpen={() => nav(`/item/${p.id}`)}
              onAddToCart={() => void requestAddWithDefectGuard(p)}
              onRemoveFromCart={() => void removeFromCart({ id: p.id, postId: p.postId })}
              onToggleFav={() => void toggleFavorite({ id: p.id, postId: p.postId })}
              isFav={p.postId ? favoritePostIdsSet.has(p.postId) : hasFavorite({ id: p.id, postId: p.postId })}
              isInCart={p.postId ? cartPostIdsSet.has(p.postId) : hasInCart({ id: p.id, postId: p.postId })}
            />
          ))}
        </div>

        {!filtered.length ? (
          <div style={{ color: "var(--muted)" }}>
            {q.trim() ? "По вашему запросу товаров не найдено." : "Товаров пока нет."}
          </div>
        ) : null}
      </div>
    </Page>
  );
}

export default CatalogPage;
