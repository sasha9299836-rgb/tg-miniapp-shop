import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProductsStore } from "../../entities/product/model/useProductsStore";
import { useFavoritesStore } from "../../entities/favorites/model/useFavoritesStore";
import { useCartStore } from "../../entities/cart/model/useCartStore";
import { getCatalogProductsByPostIds } from "../../shared/api/adminPostsApi";
import { useUserSessionReadiness } from "../../shared/auth/useUserSessionReadiness";
import type { Product } from "../../shared/types/product";
import { EmptyState } from "../../shared/ui/EmptyState";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { Page } from "../../shared/ui/Page";
import "./styles.css";

export function FavoritesPage() {
  const nav = useNavigate();
  const { products, load } = useProductsStore();
  const fav = useFavoritesStore();
  const cart = useCartStore();
  const { isReady, isChecking, errorText: readinessErrorText } = useUserSessionReadiness();
  const [itemsByFavorites, setItemsByFavorites] = useState<Product[]>([]);

  useEffect(() => {
    if (!isReady) return;
    void load();
  }, [isReady, load]);

  useEffect(() => {
    if (!isReady) return;
    void fav.load();
    void cart.load();
  }, [isReady]);

  useEffect(() => {
    const mapped = products.map((product) => ({ id: product.id, postId: product.postId }));
    fav.registerCatalogItems(mapped);
    cart.registerCatalogItems(mapped);
  }, [products]);

  useEffect(() => {
    if (!isReady) return;
    const run = async () => {
      if (!fav.postIds.length) {
        setItemsByFavorites([]);
        return;
      }
      try {
        const rows = await getCatalogProductsByPostIds(fav.postIds);
        setItemsByFavorites(rows);
        const mapped = rows.map((product) => ({ id: product.id, postId: product.postId }));
        fav.registerCatalogItems(mapped);
        cart.registerCatalogItems(mapped);
      } catch {
        setItemsByFavorites([]);
      }
    };
    void run();
  }, [fav.postIds, isReady]);

  const items = useMemo(() => {
    const map = new Map(itemsByFavorites.map((item) => [item.postId, item]));
    return fav.postIds
      .map((postId) => map.get(postId))
      .filter(Boolean) as Product[];
  }, [itemsByFavorites, fav.postIds]);

  if (isChecking) {
    return (
      <Page>
        <div className="favorites-page">
          <div style={{ color: "var(--muted)" }}>Загрузка...</div>
        </div>
      </Page>
    );
  }

  if (readinessErrorText) {
    return (
      <Page>
        <div className="favorites-page">
          <div style={{ color: "#b42318" }}>{readinessErrorText}</div>
          <div className="favorites-actions">
            <Button onClick={() => nav("/catalog")}>В каталог</Button>
          </div>
        </div>
      </Page>
    );
  }

  if (!fav.postIds.length) {
    return (
      <Page>
        <div className="favorites-page">
          <div className="favorites-header">
            <h1 className="favorites-title">Избранное</h1>
          </div>
          <EmptyState
            title="Пока пусто"
            text="Добавьте товары в избранное, чтобы быстро возвращаться к ним позже."
          />
          <div className="favorites-actions">
            <Button onClick={() => nav("/catalog")}>В каталог</Button>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="favorites-page">
        <div className="favorites-header">
          <h1 className="favorites-title">Избранное</h1>
          <Button variant="secondary" className="favorites-clear" onClick={() => void fav.clear()}>
            Удалить все
          </Button>
        </div>

        <div className="favorites-grid">
          {items.map((product) => (
            <Card key={product.postId ?? product.id} className="ui-card--padded favorites-item">
              <div
                className="favorites-item__row"
                onClick={() => nav(`/item/${product.id}`)}
                role="button"
                tabIndex={0}
              >
                <img src={product.images?.[0]} alt={product.title} className="favorites-item__image" />
                <div>
                  <div className="favorites-item__title">{product.title}</div>
                  {product.description ? (
                    <div className="favorites-item__desc">{product.description}</div>
                  ) : null}
                  <div className="favorites-item__price">
                    {product.price.toLocaleString("ru-RU")} ₽
                  </div>
                  {product.saleStatus !== "available" ? (
                    <div className="favorites-item__desc">Продано / недоступно</div>
                  ) : null}
                </div>
              </div>

              <div className="favorites-item__actions">
                <Button variant="secondary" onClick={() => void fav.remove({ id: product.id, postId: product.postId })}>Удалить</Button>
                <Button
                  onClick={() => void cart.add({ id: product.id, postId: product.postId })}
                  disabled={product.saleStatus !== "available"}
                >
                  {product.saleStatus === "available" ? "В корзину" : "Недоступно"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Page>
  );
}

export default FavoritesPage;
