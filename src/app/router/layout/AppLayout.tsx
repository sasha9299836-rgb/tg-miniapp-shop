import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { getTelegramStartParam } from "../../providers/telegram";
import { TabBar } from "../../../widgets/TabBar";
import "./AppLayout.css";

const DESKTOP_PREVIEW_KEY = "tg_desktop_mobile_preview";

export const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const startupRouteHandledRef = useRef(false);
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
