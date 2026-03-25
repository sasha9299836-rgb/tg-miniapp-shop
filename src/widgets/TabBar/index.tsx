import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useFavoritesStore } from "../../entities/favorites/model/useFavoritesStore";
import { useCartStore } from "../../entities/cart/model/useCartStore";
import "./styles.css";

type Tab = { to: string; label: string; icon: ReactNode };

const tabs: Tab[] = [
  {
    to: "/",
    label: "Главная",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 11l8-6 8 6v7a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    to: "/catalog",
    label: "Каталог",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 5h7v7H4zM13 5h7v7h-7zM4 12h7v7H4zM13 12h7v7h-7z" />
      </svg>
    ),
  },
  {
    to: "/favorites",
    label: "Избранное",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 21.2l-1.2-1.08C5.3 15.2 2 12.3 2 8.6 2 6 4.1 4 6.7 4c1.8 0 3.6.95 4.5 2.4.9-1.45 2.7-2.4 4.5-2.4 2.6 0 4.8 2 4.8 4.6 0 3.7-3.3 6.6-8.8 11.5L12 21.2z" />
      </svg>
    ),
  },
  {
    to: "/cart",
    label: "Корзина",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M6 6h12l-1.2 10.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 6z" />
        <path d="M8 6V5a4 4 0 0 1 8 0v1" />
      </svg>
    ),
  },
  {
    to: "/account",
    label: "Аккаунт",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
        <path d="M4 20a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
];

export const TabBar = () => {
  const favCount = useFavoritesStore((s) => s.ids.length);
  const cartCount = useCartStore((s) => s.totalQty());

  return (
    <nav className="tabbar">
      <div className="tabbar__inner">
        {tabs.map((t) => {
          const showFavBadge = t.to === "/favorites" && favCount > 0;
          const showCartBadge = t.to === "/cart" && cartCount > 0;
          const badgeValue = t.to === "/favorites" ? favCount : cartCount;
          const showBadge = showFavBadge || showCartBadge;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) => (isActive ? "tab tab--active" : "tab")}
            >
              <div className="tab__iconWrap" aria-hidden>
                <div className="tab__icon">
                  {t.icon}
                </div>
                {showBadge ? <span className="tab__badge">{badgeValue}</span> : null}
              </div>
              <div className="tab__label">{t.label}</div>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default TabBar;
