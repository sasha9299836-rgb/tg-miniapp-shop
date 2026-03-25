import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useProductsStore } from "../../entities/product/model/useProductsStore";
import { useFavoritesStore } from "../../entities/favorites/model/useFavoritesStore";
import { useCartStore } from "../../entities/cart/model/useCartStore";
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

  useEffect(() => {
    load();
  }, [load]);

  const items = useMemo(() => products.filter((p) => fav.ids.includes(p.id)), [products, fav.ids]);

  if (!fav.ids.length) {
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
          <Button variant="secondary" className="favorites-clear" onClick={() => fav.clear()}>
            Удалить все
          </Button>
        </div>

        <div className="favorites-grid">
          {items.map((p) => (
            <Card key={p.id} className="ui-card--padded favorites-item">
              <div
                className="favorites-item__row"
                onClick={() => nav(`/item/${p.id}`)}
                role="button"
                tabIndex={0}
              >
                <img src={p.images?.[0]} alt={p.title} className="favorites-item__image" />
                <div>
                  <div className="favorites-item__title">{p.title}</div>
                  {p.description ? (
                    <div className="favorites-item__desc">{p.description}</div>
                  ) : null}
                  <div className="favorites-item__price">
                    {p.price.toLocaleString("ru-RU")} ₽
                  </div>
                </div>
              </div>

              <div className="favorites-item__actions">
                <Button variant="secondary" onClick={() => fav.remove(p.id)}>Удалить</Button>
                <Button onClick={() => cart.add(p.id)}>В корзину</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Page>
  );
}

export default FavoritesPage;
