import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProductsStore } from "../../entities/product/model/useProductsStore";
import { Page } from "../../shared/ui/Page";
import { getActiveDropTeaser, type DropTeaser } from "../../shared/api/dropTeaserApi";
import "./styles.css";

export function HomePage() {
  const nav = useNavigate();
  const { products, load } = useProductsStore();
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

  const updateItems = useMemo(() => products.filter((product) => product.isNew).slice(0, 12), [products]);
  const discountItems = useMemo(
    () => products.filter((product) => typeof product.oldPrice === "number" && product.oldPrice > product.price).slice(0, 12),
    [products],
  );
  const catalogItems = useMemo(
    () =>
      products
        .filter((product) => !product.isNew)
        .filter((product) => !(typeof product.oldPrice === "number" && product.oldPrice > product.price))
        .slice(0, 12),
    [products],
  );

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

      {updateItems.length ? (
        <section className="home-section">
          <div className="home-section__head">
            <div className="home-section__title">Обновление</div>
            <button type="button" className="home-section__link" onClick={() => nav("/catalog?filter=updates")}
            >
              Смотреть все
            </button>
          </div>

          <div className="home-update-row">
            {updateItems.map((product) => (
              <button
                type="button"
                key={product.postId ?? `id:${product.id}`}
                className="home-update-card"
                onClick={() => nav(`/item/${product.id}`)}
              >
                <div className="home-update-card__mediaWrap">
                  {product.isNew ? <span className="home-update-card__badge">NEW</span> : null}
                  {product.images[0] ? (
                    <img src={product.images[0]} alt={product.title} className="home-update-card__media" />
                  ) : (
                    <div className="home-update-card__media home-update-card__media--empty" />
                  )}
                </div>
                <div className="home-update-card__body">
                  <div className="home-update-card__title">{product.title}</div>
                  <div className="home-update-card__price">{product.price.toLocaleString("ru-RU")} ₽</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {catalogItems.length ? (
        <section className="home-section">
          <div className="home-section__head">
            <div className="home-section__title">Каталог</div>
            <button type="button" className="home-section__link" onClick={() => nav("/catalog")}
            >
              Смотреть все
            </button>
          </div>

          <div className="home-update-row">
            {catalogItems.map((product) => (
              <button
                type="button"
                key={product.postId ?? `id:${product.id}`}
                className="home-update-card"
                onClick={() => nav(`/item/${product.id}`)}
              >
                <div className="home-update-card__mediaWrap">
                  {product.images[0] ? (
                    <img src={product.images[0]} alt={product.title} className="home-update-card__media" />
                  ) : (
                    <div className="home-update-card__media home-update-card__media--empty" />
                  )}
                </div>
                <div className="home-update-card__body">
                  <div className="home-update-card__title">{product.title}</div>
                  <div className="home-update-card__price">{product.price.toLocaleString("ru-RU")} ₽</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {discountItems.length ? (
        <section className="home-section">
          <div className="home-section__head">
            <div className="home-section__title">Скидки</div>
            <button type="button" className="home-section__link" onClick={() => nav("/catalog?filter=discounts")}
            >
              Смотреть все
            </button>
          </div>

          <div className="home-update-row">
            {discountItems.map((product) => {
              const discountPercent = typeof product.oldPrice === "number" && product.oldPrice > product.price
                ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
                : 0;
              return (
                <button
                  type="button"
                  key={product.postId ?? `id:${product.id}`}
                  className="home-update-card"
                  onClick={() => nav(`/item/${product.id}`)}
                >
                  <div className="home-update-card__mediaWrap">
                    {discountPercent > 0 ? <span className="home-update-card__discountBadge">{`-${discountPercent}%`}</span> : null}
                    {product.images[0] ? (
                      <img src={product.images[0]} alt={product.title} className="home-update-card__media" />
                    ) : (
                      <div className="home-update-card__media home-update-card__media--empty" />
                    )}
                  </div>
                  <div className="home-update-card__body">
                    <div className="home-update-card__title">{product.title}</div>
                    <div className="home-update-card__priceRow">
                      <div className="home-update-card__price">{product.price.toLocaleString("ru-RU")} ₽</div>
                      {typeof product.oldPrice === "number" && product.oldPrice > product.price ? (
                        <div className="home-update-card__oldPrice">{product.oldPrice.toLocaleString("ru-RU")} ₽</div>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </Page>
  );
}

export default HomePage;
