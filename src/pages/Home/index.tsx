import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useProductsStore } from "../../entities/product/model/useProductsStore";
import { useFavoritesStore } from "../../entities/favorites/model/useFavoritesStore";
import { useCartStore } from "../../entities/cart/model/useCartStore";
import { Page } from "../../shared/ui/Page";
import { ProductCard } from "../../widgets/ProductCard";
import "./styles.css";

export function HomePage() {
  const nav = useNavigate();
  const { products, load } = useProductsStore();
  const fav = useFavoritesStore();
  const cart = useCartStore();

  useEffect(() => {
    if (!products.length) load();
  }, [products.length, load]);

  useEffect(() => {
    void fav.load();
    void cart.load();
  }, []);

  useEffect(() => {
    const mapped = products.map((product) => ({ id: product.id, postId: product.postId }));
    fav.registerCatalogItems(mapped);
    cart.registerCatalogItems(mapped);
  }, [products]);

  const catalogItems = useMemo(() => {
    if (!products.length) return [];
    return [...products]
      .slice(0, 8)
      .sort(() => Math.random() - 0.5);
  }, [products]);

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
              Добавить адресс доставки
            </button>
            <button type="button" className="home-hero__btn" onClick={() => {}}
            >
              Правила магазина
            </button>
          </div>
        </div>
        <div className="home-hero__orb" />
      </section>

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
            : catalogItems.map((p, idx) => (
                <ProductCard
                  key={`${p.id}-${idx}`}
                  product={p}
                  onOpen={() => nav(`/item/${p.id}`)}
                  onAddToCart={() => void cart.add({ id: p.id, postId: p.postId })}
                  onToggleFav={() => void fav.toggle({ id: p.id, postId: p.postId })}
                  isFav={fav.has({ id: p.id, postId: p.postId })}
                  isInCart={cart.has({ id: p.id, postId: p.postId })}
                />
              ))}
        </div>
      </section>
    </Page>
  );
}

export default HomePage;
