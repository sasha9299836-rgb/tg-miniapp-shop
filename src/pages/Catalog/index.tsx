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

const FILTER_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "new", label: "Новинки" },
  { value: "price-asc", label: "Цена: по возрастанию" },
  { value: "price-desc", label: "Цена: по убыванию" },
  { value: "discount", label: "Скидки" },
];

type FilterValue = typeof FILTER_OPTIONS[number]["value"];

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
  const [filter, setFilter] = useState<FilterValue>("all");

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

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = !s ? products : products.filter((p) => p.title.toLowerCase().includes(s));
    if (!base.length) return base;

    const sorted = [...base];
    if (filter === "price-asc") sorted.sort((a, b) => a.price - b.price);
    if (filter === "price-desc") sorted.sort((a, b) => b.price - a.price);
    if (filter === "discount") {
      sorted.sort((a, b) => {
        const aDiscount = (a.oldPrice ?? 0) - a.price;
        const bDiscount = (b.oldPrice ?? 0) - b.price;
        return bDiscount - aDiscount;
      });
    }
    if (filter === "new") {
      sorted.sort((a, b) => Number(b.isNew) - Number(a.isNew));
    }
    if (filter === "all") {
      sorted.sort((a, b) => Number(b.isNew) - Number(a.isNew));
    }

    return sorted;
  }, [products, q, filter]);
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
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`catalog-filters__option ${filter === opt.value ? "is-active" : ""}`}
                  onClick={() => setFilter(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
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
