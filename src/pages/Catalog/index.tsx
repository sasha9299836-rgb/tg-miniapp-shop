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

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;
type SortValue = "default" | "price-asc" | "price-desc";

function normalizeSizeToken(raw: string): string {
  const token = raw.trim().toUpperCase();
  if (token === "XXL") return "2XL";
  if (token === "XXXL") return "3XL";
  if (token === "XXXXL") return "4XL";
  return token;
}

function parseSizeTokens(rawSize: string | null | undefined): string[] {
  const source = String(rawSize ?? "").trim();
  if (!source) return [];
  const set = new Set<string>();
  for (const part of source.split("-")) {
    const normalized = normalizeSizeToken(part);
    if (!normalized) continue;
    set.add(normalized);
  }
  return Array.from(set);
}

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
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [newOnly, setNewOnly] = useState(false);
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [sortBy, setSortBy] = useState<SortValue>("default");

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
      for (const token of parseSizeTokens(product.size ?? null)) {
        if (!token) continue;
        set.add(token);
      }
    }
    const unique = Array.from(set);
    const orderMap = new Map<string, number>(SIZE_ORDER.map((value, index) => [value, index]));
    unique.sort((a, b) => {
      const ai = orderMap.get(a);
      const bi = orderMap.get(b);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return a.localeCompare(b, "ru");
    });
    return unique;
  }, [products]);

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    for (const product of products) {
      const value = String(product.brand ?? "").trim();
      if (!value) continue;
      set.add(value);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [products]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const from = Number(priceFrom);
    const to = Number(priceTo);
    const hasFrom = Number.isFinite(from);
    const hasTo = Number.isFinite(to);
    const filteredProducts = products.filter((p) => {
      if (s && !p.title.toLowerCase().includes(s)) return false;
      if (typeFilter && String(p.title ?? "").trim() !== typeFilter) return false;
      if (selectedBrands.length) {
        const brandValue = String(p.brand ?? "").trim();
        if (!selectedBrands.includes(brandValue)) return false;
      }
      if (selectedSizes.length) {
        const tokens = parseSizeTokens(p.size ?? null);
        if (!tokens.length) return false;
        const hasMatch = selectedSizes.some((size) => tokens.includes(size));
        if (!hasMatch) return false;
      }
      const numericPrice = Number(p.price);
      if (!Number.isFinite(numericPrice)) return false;
      if (hasFrom && numericPrice < from) return false;
      if (hasTo && numericPrice > to) return false;
      if (newOnly && !p.isNew) return false;
      return true;
    });
    if (sortBy === "price-asc") return [...filteredProducts].sort((a, b) => Number(a.price) - Number(b.price));
    if (sortBy === "price-desc") return [...filteredProducts].sort((a, b) => Number(b.price) - Number(a.price));
    return filteredProducts;
  }, [products, q, typeFilter, selectedBrands, selectedSizes, priceFrom, priceTo, newOnly, sortBy]);

  const onToggleSize = (size: string) => {
    setSelectedSizes((prev) => (prev.includes(size) ? prev.filter((value) => value !== size) : [...prev, size]));
  };

  const onToggleBrand = (brand: string) => {
    setSelectedBrands((prev) => (prev.includes(brand) ? prev.filter((value) => value !== brand) : [...prev, brand]));
  };

  const onPriceFromChange = (value: string) => setPriceFrom(value.replace(/\D/g, ""));
  const onPriceToChange = (value: string) => setPriceTo(value.replace(/\D/g, ""));

  const resetFilters = () => {
    setTypeFilter("");
    setSelectedSizes([]);
    setSelectedBrands([]);
    setNewOnly(false);
    setPriceFrom("");
    setPriceTo("");
    setSortBy("default");
  };

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
                <div className="catalog-filters__multi">
                  {sizeOptions.map((value) => (
                    <label key={value} className="catalog-filters__checkbox">
                      <input type="checkbox" checked={selectedSizes.includes(value)} onChange={() => onToggleSize(value)} />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </label>
              <label className="catalog-filters__field">
                <span className="catalog-filters__label">Бренд</span>
                <div className="catalog-filters__multi">
                  {brandOptions.map((value) => (
                    <label key={value} className="catalog-filters__checkbox">
                      <input type="checkbox" checked={selectedBrands.includes(value)} onChange={() => onToggleBrand(value)} />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </label>
              <label className="catalog-filters__field">
                <span className="catalog-filters__label">Цена от</span>
                <Input placeholder="0" value={priceFrom} onChange={(event) => onPriceFromChange(event.target.value)} />
              </label>
              <label className="catalog-filters__field">
                <span className="catalog-filters__label">Цена до</span>
                <Input placeholder="0" value={priceTo} onChange={(event) => onPriceToChange(event.target.value)} />
              </label>
              <label className="catalog-filters__field">
                <span className="catalog-filters__label">Сортировка цены</span>
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortValue)} className="catalog-filters__select">
                  <option value="default">Без сортировки</option>
                  <option value="price-asc">Дешевле → дороже</option>
                  <option value="price-desc">Дороже → дешевле</option>
                </select>
              </label>
              <label className="catalog-filters__checkbox">
                <input type="checkbox" checked={newOnly} onChange={(event) => setNewOnly(event.target.checked)} />
                <span>Новинки</span>
              </label>
            </div>
            <div className="catalog-filters__actions">
              <Button variant="secondary" onClick={resetFilters}>Сбросить фильтры</Button>
              <Button variant="secondary" onClick={() => setIsFiltersOpen(false)}>Закрыть</Button>
            </div>
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
