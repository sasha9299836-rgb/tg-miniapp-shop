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
const CATALOG_FILTERS_SESSION_KEY = "catalog_filters_v1";

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

function normalizeTypeKey(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

function formatTypeLabel(raw: string): string {
  const source = normalizeTypeKey(raw);
  if (!source) return "";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

type CatalogFiltersSessionState = {
  typeFilter: string;
  selectedSizes: string[];
  selectedBrands: string[];
  newOnly: boolean;
  priceFrom: string;
  priceTo: string;
  sortBy: SortValue;
};

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
  const [appliedTypeFilter, setAppliedTypeFilter] = useState("");
  const [appliedSelectedSizes, setAppliedSelectedSizes] = useState<string[]>([]);
  const [appliedSelectedBrands, setAppliedSelectedBrands] = useState<string[]>([]);
  const [appliedNewOnly, setAppliedNewOnly] = useState(false);
  const [appliedPriceFrom, setAppliedPriceFrom] = useState("");
  const [appliedPriceTo, setAppliedPriceTo] = useState("");
  const [appliedSortBy, setAppliedSortBy] = useState<SortValue>("default");
  const [draftTypeFilter, setDraftTypeFilter] = useState("");
  const [draftSelectedSizes, setDraftSelectedSizes] = useState<string[]>([]);
  const [draftSelectedBrands, setDraftSelectedBrands] = useState<string[]>([]);
  const [draftNewOnly, setDraftNewOnly] = useState(false);
  const [draftPriceFrom, setDraftPriceFrom] = useState("");
  const [draftPriceTo, setDraftPriceTo] = useState("");
  const [draftSortBy, setDraftSortBy] = useState<SortValue>("default");

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(CATALOG_FILTERS_SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<CatalogFiltersSessionState>;
      const nextTypeFilter = typeof parsed.typeFilter === "string" ? parsed.typeFilter : "";
      const nextSelectedSizes = Array.isArray(parsed.selectedSizes) ? parsed.selectedSizes.filter((value): value is string => typeof value === "string") : [];
      const nextSelectedBrands = Array.isArray(parsed.selectedBrands) ? parsed.selectedBrands.filter((value): value is string => typeof value === "string") : [];
      const nextNewOnly = Boolean(parsed.newOnly);
      const nextPriceFrom = typeof parsed.priceFrom === "string" ? parsed.priceFrom : "";
      const nextPriceTo = typeof parsed.priceTo === "string" ? parsed.priceTo : "";
      const nextSortBy = parsed.sortBy === "price-asc" || parsed.sortBy === "price-desc" || parsed.sortBy === "default" ? parsed.sortBy : "default";
      setAppliedTypeFilter(nextTypeFilter);
      setAppliedSelectedSizes(nextSelectedSizes);
      setAppliedSelectedBrands(nextSelectedBrands);
      setAppliedNewOnly(nextNewOnly);
      setAppliedPriceFrom(nextPriceFrom);
      setAppliedPriceTo(nextPriceTo);
      setAppliedSortBy(nextSortBy);
      setDraftTypeFilter(nextTypeFilter);
      setDraftSelectedSizes(nextSelectedSizes);
      setDraftSelectedBrands(nextSelectedBrands);
      setDraftNewOnly(nextNewOnly);
      setDraftPriceFrom(nextPriceFrom);
      setDraftPriceTo(nextPriceTo);
      setDraftSortBy(nextSortBy);
    } catch {
      // ignore broken session state
    }
  }, []);

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
    const map = new Map<string, string>();
    for (const product of products) {
      const key = normalizeTypeKey(product.title ?? "");
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, formatTypeLabel(key));
      }
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
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
    const fromRaw = appliedPriceFrom.trim();
    const toRaw = appliedPriceTo.trim();
    const from = Number(fromRaw);
    const to = Number(toRaw);
    const hasFrom = fromRaw.length > 0 && Number.isFinite(from);
    const hasTo = toRaw.length > 0 && Number.isFinite(to);
    const filteredProducts = products.filter((p) => {
      if (s && !p.title.toLowerCase().includes(s)) return false;
      if (appliedTypeFilter && normalizeTypeKey(p.title ?? "") !== appliedTypeFilter) return false;
      if (appliedSelectedBrands.length) {
        const brandValue = String(p.brand ?? "").trim();
        if (!appliedSelectedBrands.includes(brandValue)) return false;
      }
      if (appliedSelectedSizes.length) {
        const tokens = parseSizeTokens(p.size ?? null);
        if (!tokens.length) return false;
        const hasMatch = appliedSelectedSizes.some((size) => tokens.includes(size));
        if (!hasMatch) return false;
      }
      const numericPrice = Number(p.price);
      if (!Number.isFinite(numericPrice)) return false;
      if (hasFrom && numericPrice < from) return false;
      if (hasTo && numericPrice > to) return false;
      if (appliedNewOnly && !p.isNew) return false;
      return true;
    });
    if (appliedSortBy === "price-asc") return [...filteredProducts].sort((a, b) => Number(a.price) - Number(b.price));
    if (appliedSortBy === "price-desc") return [...filteredProducts].sort((a, b) => Number(b.price) - Number(a.price));
    return filteredProducts;
  }, [products, q, appliedTypeFilter, appliedSelectedBrands, appliedSelectedSizes, appliedPriceFrom, appliedPriceTo, appliedNewOnly, appliedSortBy]);

  const onToggleSize = (size: string) => {
    setDraftSelectedSizes((prev) => (prev.includes(size) ? prev.filter((value) => value !== size) : [...prev, size]));
  };

  const onToggleBrand = (brand: string) => {
    setDraftSelectedBrands((prev) => (prev.includes(brand) ? prev.filter((value) => value !== brand) : [...prev, brand]));
  };

  const onPriceFromChange = (value: string) => setDraftPriceFrom(value.replace(/\D/g, ""));
  const onPriceToChange = (value: string) => setDraftPriceTo(value.replace(/\D/g, ""));

  const applyFilters = () => {
    setAppliedTypeFilter(draftTypeFilter);
    setAppliedSelectedSizes(draftSelectedSizes);
    setAppliedSelectedBrands(draftSelectedBrands);
    setAppliedNewOnly(draftNewOnly);
    setAppliedPriceFrom(draftPriceFrom);
    setAppliedPriceTo(draftPriceTo);
    setAppliedSortBy(draftSortBy);
  };

  const resetFilters = () => {
    setDraftTypeFilter("");
    setDraftSelectedSizes([]);
    setDraftSelectedBrands([]);
    setDraftNewOnly(false);
    setDraftPriceFrom("");
    setDraftPriceTo("");
    setDraftSortBy("default");
    setAppliedTypeFilter("");
    setAppliedSelectedSizes([]);
    setAppliedSelectedBrands([]);
    setAppliedNewOnly(false);
    setAppliedPriceFrom("");
    setAppliedPriceTo("");
    setAppliedSortBy("default");
    try {
      window.sessionStorage.removeItem(CATALOG_FILTERS_SESSION_KEY);
    } catch {
      // no-op
    }
  };

  useEffect(() => {
    const payload: CatalogFiltersSessionState = {
      typeFilter: appliedTypeFilter,
      selectedSizes: appliedSelectedSizes,
      selectedBrands: appliedSelectedBrands,
      newOnly: appliedNewOnly,
      priceFrom: appliedPriceFrom,
      priceTo: appliedPriceTo,
      sortBy: appliedSortBy,
    };
    try {
      window.sessionStorage.setItem(CATALOG_FILTERS_SESSION_KEY, JSON.stringify(payload));
    } catch {
      // no-op
    }
  }, [appliedTypeFilter, appliedSelectedSizes, appliedSelectedBrands, appliedNewOnly, appliedPriceFrom, appliedPriceTo, appliedSortBy]);

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (appliedTypeFilter) {
      chips.push(`Тип: ${formatTypeLabel(appliedTypeFilter)}`);
    }
    if (appliedSelectedBrands.length) {
      chips.push(`Бренд: ${appliedSelectedBrands.join(", ")}`);
    }
    if (appliedSelectedSizes.length) {
      chips.push(`Размер: ${appliedSelectedSizes.join(", ")}`);
    }
    if (appliedNewOnly) {
      chips.push("Новинки");
    }
    if (appliedPriceFrom) {
      chips.push(`Цена от: ${appliedPriceFrom}`);
    }
    if (appliedPriceTo) {
      chips.push(`Цена до: ${appliedPriceTo}`);
    }
    if (appliedSortBy === "price-asc") {
      chips.push("Сортировка: дешевле → дороже");
    }
    if (appliedSortBy === "price-desc") {
      chips.push("Сортировка: дороже → дешевле");
    }
    return chips;
  }, [appliedTypeFilter, appliedSelectedBrands, appliedSelectedSizes, appliedNewOnly, appliedPriceFrom, appliedPriceTo, appliedSortBy]);

  const activeFiltersCount = activeFilterChips.length;

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
            {activeFiltersCount > 0 ? `Фильтры • ${activeFiltersCount}` : "Фильтры"}
          </Button>
        </div>
        {activeFiltersCount > 0 ? (
          <div className="catalog-active-filters-wrap">
            <div className="catalog-active-filters">
              {activeFilterChips.map((chip) => (
                <span key={chip} className="catalog-active-filters__chip">{chip}</span>
              ))}
            </div>
            <Button variant="secondary" style={{ width: "auto" }} onClick={resetFilters}>
              Сбросить
            </Button>
          </div>
        ) : null}

        {isFiltersOpen ? (
          <div className="catalog-filters">
            <div className="catalog-filters__head">
              <div className="catalog-filters__title">Фильтры</div>
              <Button variant="secondary" style={{ width: "auto" }} onClick={resetFilters}>
                Сбросить
              </Button>
            </div>
            <div className="catalog-filters__options">
              <label className="catalog-filters__field">
                <span className="catalog-filters__label">Тип вещи</span>
                <select value={draftTypeFilter} onChange={(event) => setDraftTypeFilter(event.target.value)} className="catalog-filters__select">
                  <option value="">Все</option>
                  {typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="catalog-filters__field">
                <span className="catalog-filters__label">Размер</span>
                <div className="catalog-filters__multi">
                  {sizeOptions.map((value) => (
                    <label key={value} className="catalog-filters__checkbox catalog-filters__checkbox--pill">
                      <input type="checkbox" checked={draftSelectedSizes.includes(value)} onChange={() => onToggleSize(value)} />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </label>
              <label className="catalog-filters__field">
                <span className="catalog-filters__label">Бренд</span>
                <div className="catalog-filters__multi">
                  {brandOptions.map((value) => (
                    <label key={value} className="catalog-filters__checkbox catalog-filters__checkbox--pill">
                      <input type="checkbox" checked={draftSelectedBrands.includes(value)} onChange={() => onToggleBrand(value)} />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </label>
              <label className="catalog-filters__field">
                <span className="catalog-filters__label">Цена от</span>
                <Input placeholder="0" value={draftPriceFrom} onChange={(event) => onPriceFromChange(event.target.value)} />
              </label>
              <label className="catalog-filters__field">
                <span className="catalog-filters__label">Цена до</span>
                <Input placeholder="0" value={draftPriceTo} onChange={(event) => onPriceToChange(event.target.value)} />
              </label>
              <label className="catalog-filters__field">
                <span className="catalog-filters__label">Сортировка цены</span>
                <select value={draftSortBy} onChange={(event) => setDraftSortBy(event.target.value as SortValue)} className="catalog-filters__select">
                  <option value="default">Без сортировки</option>
                  <option value="price-asc">Дешевле → дороже</option>
                  <option value="price-desc">Дороже → дешевле</option>
                </select>
              </label>
              <label className="catalog-filters__checkbox">
                <input type="checkbox" checked={draftNewOnly} onChange={(event) => setDraftNewOnly(event.target.checked)} />
                <span>Новинки</span>
              </label>
            </div>
            <div className="catalog-filters__actions">
              <Button onClick={applyFilters}>Применить фильтры</Button>
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
