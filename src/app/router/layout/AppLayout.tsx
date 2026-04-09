import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { getTelegramStartParam } from "../../providers/telegram";
import { TabBar } from "../../../widgets/TabBar";
import "./AppLayout.css";

const DESKTOP_PREVIEW_KEY = "tg_desktop_mobile_preview";
const CATALOG_PATH = "/catalog";
const CATALOG_SCROLL_STORAGE_KEY = "catalog_scroll_y";

function isCatalogRoute(pathname: string): boolean {
  return pathname === CATALOG_PATH;
}

function readStoredCatalogScrollY(): number {
  try {
    const raw = window.sessionStorage.getItem(CATALOG_SCROLL_STORAGE_KEY);
    const value = Number.parseFloat(String(raw ?? ""));
    if (!Number.isFinite(value) || value < 0) return 0;
    return value;
  } catch {
    return 0;
  }
}

function writeStoredCatalogScrollY(value: number) {
  try {
    const safe = Number.isFinite(value) && value > 0 ? String(value) : "0";
    window.sessionStorage.setItem(CATALOG_SCROLL_STORAGE_KEY, safe);
  } catch {
    // no-op
  }
}

export const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const startupRouteHandledRef = useRef(false);
  const previousPathnameRef = useRef(location.pathname);
  const catalogScrollYRef = useRef(readStoredCatalogScrollY());
  const [isDesktopScreen, setIsDesktopScreen] = useState(false);
  const [isLikelyMobileRuntime, setIsLikelyMobileRuntime] = useState(false);
  const [isMobilePreview, setIsMobilePreview] = useState(false);

  useEffect(() => {
    if (startupRouteHandledRef.current) return;
    startupRouteHandledRef.current = true;

    const startParam = getTelegramStartParam();
    if (!startParam || !startParam.startsWith("item_")) return;

    const itemRef = startParam.slice("item_".length).trim();
    if (!itemRef) return;

    if (location.pathname !== "/") return;
    navigate(`/item/${encodeURIComponent(itemRef)}`, { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    const updateDesktopFlag = () => {
      setIsDesktopScreen(window.matchMedia("(min-width: 1024px)").matches);
      setIsLikelyMobileRuntime(/Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent));
    };
    updateDesktopFlag();
    window.addEventListener("resize", updateDesktopFlag);
    return () => window.removeEventListener("resize", updateDesktopFlag);
  }, []);

  useEffect(() => {
    try {
      setIsMobilePreview(window.localStorage.getItem(DESKTOP_PREVIEW_KEY) === "1");
    } catch {
      setIsMobilePreview(false);
    }
  }, []);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    const currentPathname = location.pathname;

    if (previousPathname !== currentPathname && isCatalogRoute(previousPathname)) {
      const currentScrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
      catalogScrollYRef.current = currentScrollY;
      writeStoredCatalogScrollY(currentScrollY);
    }

    const raf = window.requestAnimationFrame(() => {
      if (isCatalogRoute(currentPathname)) {
        const storedCatalogScrollY = readStoredCatalogScrollY();
        const targetScrollY = storedCatalogScrollY > 0 ? storedCatalogScrollY : catalogScrollYRef.current;
        window.scrollTo({ top: Math.max(0, targetScrollY), left: 0, behavior: "auto" });
      } else {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    });

    previousPathnameRef.current = currentPathname;
    return () => window.cancelAnimationFrame(raf);
  }, [location.pathname, navigationType]);

  const togglePreview = () => {
    setIsMobilePreview((prev) => {
      const next = !prev;
      try {
        if (next) {
          window.localStorage.setItem(DESKTOP_PREVIEW_KEY, "1");
        } else {
          window.localStorage.removeItem(DESKTOP_PREVIEW_KEY);
        }
      } catch {
        // no-op
      }
      return next;
    });
  };

  const showDesktopToggle = isDesktopScreen && !isLikelyMobileRuntime;
  const useMobilePreviewLayout = isDesktopScreen && isMobilePreview;

  return (
    <div className={`app-shell${useMobilePreviewLayout ? " app-shell--mobilePreview" : ""}`}>
      {showDesktopToggle ? (
        <button
          type="button"
          className={`app-preview-toggle${useMobilePreviewLayout ? " is-active" : ""}`}
          onClick={togglePreview}
          aria-label={useMobilePreviewLayout ? "Disable mobile preview" : "Enable mobile preview"}
          title={useMobilePreviewLayout ? "Desktop width" : "Mobile preview"}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 2v14h6V5H9z" />
          </svg>
        </button>
      ) : null}
      <main className="app-content">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
};

export default AppLayout;
