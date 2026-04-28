import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useFavoritesStore } from "../../entities/favorites/model/useFavoritesStore";
import { useCartStore } from "../../entities/cart/model/useCartStore";
import { triggerHapticTabPress } from "../../shared/lib/telegramHaptics";
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
        <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
      </svg>
    ),
  },
  {
    to: "/favorites",
    label: "Избранное",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M16.4 4C14.6 4 13 4.9 12 6.3C11 4.9 9.4 4 7.6 4C4.5 4 2 6.5 2 9.6C2 14 12 22 12 22S22 14 22 9.6C22 6.5 19.5 4 16.4 4Z" />
      </svg>
    ),
  },
  {
    to: "/cart",
    label: "Корзина",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M7 6h13l-1.6 8.5a2 2 0 0 1-2 1.6H9a2 2 0 0 1-2-1.6L5.5 4H3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="19" r="1.5" fill="currentColor" />
        <circle cx="17" cy="19" r="1.5" fill="currentColor" />
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
  const favCount = useFavoritesStore((s) => s.postIds.length);
  const cartCount = useCartStore((s) => s.totalQty());
  const resolveTabHapticVariant = (to: string): "home" | "catalog" | "favorites" | "default" => {
    if (to === "/") return "home";
    if (to === "/catalog") return "catalog";
    if (to === "/favorites") return "favorites";
    return "default";
  };

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
              onClick={() => triggerHapticTabPress(resolveTabHapticVariant(t.to))}
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
