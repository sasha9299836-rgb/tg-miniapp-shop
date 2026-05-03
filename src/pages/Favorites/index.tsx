import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProductsStore } from "../../entities/product/model/useProductsStore";
import { useFavoritesStore } from "../../entities/favorites/model/useFavoritesStore";
import { useCartStore } from "../../entities/cart/model/useCartStore";
import { useDefectReviewStore } from "../../entities/cart/model/useDefectReviewStore";
import { getCatalogProductsByPostIds } from "../../shared/api/adminPostsApi";
import { useUserSessionReadiness } from "../../shared/auth/useUserSessionReadiness";
import type { Product } from "../../shared/types/product";
import { EmptyState } from "../../shared/ui/EmptyState";
import { Button } from "../../shared/ui/Button";
import { Card } from "../../shared/ui/Card";
import { Page } from "../../shared/ui/Page";
import { ProductThumb } from "../../shared/ui/ProductThumb";
import "./styles.css";

export function FavoritesPage() {
  const nav = useNavigate();
  const { products, load } = useProductsStore();
  const fav = useFavoritesStore();
  const cart = useCartStore();
  const requestAddWithDefectGuard = useDefectReviewStore((s) => s.requestAddWithDefectGuard);
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
  }, [isReady, fav, cart]);

  useEffect(() => {
    const mapped = products.map((product) => ({ id: product.id, postId: product.postId }));
    fav.registerCatalogItems(mapped);
    cart.registerCatalogItems(mapped);
  }, [products, fav, cart]);

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
  }, [fav.postIds, isReady, fav, cart]);

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
          <div style={{ color: "var(--muted)" }}>{"\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430..."}</div>
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
            <Button onClick={() => nav("/catalog")}>{"\u0412 \u043a\u0430\u0442\u0430\u043b\u043e\u0433"}</Button>
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
            <h1 className="favorites-title">{"\u0418\u0437\u0431\u0440\u0430\u043d\u043d\u043e\u0435"}</h1>
          </div>
          <EmptyState
            title={"\u041f\u043e\u043a\u0430 \u043f\u0443\u0441\u0442\u043e"}
            text={"\u0414\u043e\u0431\u0430\u0432\u044c\u0442\u0435 \u0442\u043e\u0432\u0430\u0440\u044b \u0432 \u0438\u0437\u0431\u0440\u0430\u043d\u043d\u043e\u0435, \u0447\u0442\u043e\u0431\u044b \u0431\u044b\u0441\u0442\u0440\u043e \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u0442\u044c\u0441\u044f \u043a \u043d\u0438\u043c \u043f\u043e\u0437\u0436\u0435."}
          />
          <div className="favorites-actions">
            <Button onClick={() => nav("/catalog")}>{"\u0412 \u043a\u0430\u0442\u0430\u043b\u043e\u0433"}</Button>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="favorites-page">
        <div className="favorites-header">
          <h1 className="favorites-title">{"\u0418\u0437\u0431\u0440\u0430\u043d\u043d\u043e\u0435"}</h1>
          <Button variant="secondary" className="favorites-clear" onClick={() => void fav.clear()}>
            {"\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0432\u0441\u0435"}
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
                <ProductThumb src={product.images?.[0]} alt={product.title} variant="square" className="favorites-item__thumb" />
                <div>
                  <div className="favorites-item__title">{product.title}</div>
                  {product.description ? (
                    <div className="favorites-item__desc">{product.description}</div>
                  ) : null}
                  <div className="favorites-item__price">
                    {product.price.toLocaleString("ru-RU")} {"\u20BD"}
                  </div>
                  {product.saleStatus !== "available" ? (
                    <div className="favorites-item__desc">{"\u041f\u0440\u043e\u0434\u0430\u043d\u043e / \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e"}</div>
                  ) : null}
                </div>
              </div>

              <div className="favorites-item__actions">
                <Button variant="secondary" onClick={() => void fav.remove({ id: product.id, postId: product.postId })}>{"\u0423\u0434\u0430\u043b\u0438\u0442\u044c"}</Button>
                <Button
                  onClick={() => void requestAddWithDefectGuard(product)}
                  disabled={product.saleStatus !== "available"}
                >
                  {product.saleStatus === "available"
                    ? "\u0412 \u043a\u043e\u0440\u0437\u0438\u043d\u0443"
                    : "\u041d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e"}
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
