import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProductsStore } from "../../entities/product/model/useProductsStore";
import { useFavoritesStore } from "../../entities/favorites/model/useFavoritesStore";
import { useCartStore } from "../../entities/cart/model/useCartStore";
import { useDefectReviewStore } from "../../entities/cart/model/useDefectReviewStore";
import { Page } from "../../shared/ui/Page";
import { ProductCard } from "../../widgets/ProductCard";
import { getActiveDropTeaser, type DropTeaser } from "../../shared/api/dropTeaserApi";
import "./styles.css";

export function HomePage() {
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
  const [dropTeaser, setDropTeaser] = useState<DropTeaser | null>(null);

  useEffect(() => {
    if (!products.length) load();
  }, [products.length, load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const teaser = await getActiveDropTeaser();
        if (!cancelled) setDropTeaser(teaser);
      } catch {
        if (!cancelled) setDropTeaser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadFavorites();
    void loadCart();
  }, [loadFavorites, loadCart]);

  useEffect(() => {
    const mapped = products.map((product) => ({ id: product.id, postId: product.postId }));
    registerFavoriteCatalogItems(mapped);
    registerCartCatalogItems(mapped);
  }, [products, registerFavoriteCatalogItems, registerCartCatalogItems]);

  const catalogItems = useMemo(() => {
    if (!products.length) return [];
    return products.slice(0, 8);
  }, [products]);
  const favoritePostIdsSet = useMemo(() => new Set(favoritePostIds), [favoritePostIds]);
  const cartPostIdsSet = useMemo(
    () => new Set(cartItems.map((item) => String(item.postId ?? "").trim()).filter(Boolean)),
    [cartItems],
  );

  const showPlaceholders = !products.length;

  return (
    <Page
      title="Главная"
      subtitle="Трендовые вещи и быстрый доступ к каталогу."
    >
      <section className="home-hero">
        <div className="home-hero__content">
          <div className="home-hero__title">Лучшие вещи в одной коллекции</div>
          <div className="home-hero__text">
            Собираем новые категории и рекомендации на базе ваших интересов.
          </div>
          <div className="home-hero__actions">
            <button type="button" className="home-hero__btn" onClick={() => nav("/account/addresses")}
            >
              Добавить адрес доставки
            </button>
            <button type="button" className="home-hero__btn" onClick={() => nav("/info/channel-rules")}
            >
              Правила канала
            </button>
          </div>
        </div>
        <div className="home-hero__orb" />
      </section>

      {dropTeaser ? (
        <section className="home-drop-teaser">
          <div className="home-drop-teaser__head">
            <div className="home-drop-teaser__badge">Скоро новое поступление</div>
            <div className="home-drop-teaser__text">{dropTeaser.shortText}</div>
          </div>
          <div className="home-drop-teaser__body">
            {dropTeaser.previewImages.length ? (
              <div className={`home-drop-teaser__images home-drop-teaser__images--${Math.min(dropTeaser.previewImages.length, 4)}`}>
                {dropTeaser.previewImages.slice(0, 4).map((image, idx) => (
                  <img key={`${dropTeaser.id}-${idx}`} src={image} alt={`Анонс ${idx + 1}`} className="home-drop-teaser__image" />
                ))}
              </div>
            ) : null}
            <button type="button" className="home-drop-teaser__cta" onClick={() => nav("/drop-preview")}>
              Смотреть анонс
            </button>
          </div>
        </section>
      ) : null}

      <section className="home-section">
        <div className="home-section__head">
          <div className="home-section__title">Каталог</div>
          <button type="button" className="home-section__link" onClick={() => nav("/catalog")}
          >
            Смотреть все
          </button>
        </div>

        <div className="home-grid">
          {showPlaceholders
            ? Array.from({ length: 8 }).map((_, idx) => (
                <div key={`grid-placeholder-${idx}`} className="home-skeleton" />
              ))
            : catalogItems.map((p) => (
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
      </section>
    </Page>
  );
}

export default HomePage;

