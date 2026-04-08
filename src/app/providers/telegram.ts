export type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void | Promise<void>;
  close?: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  initData?: string;
  initDataUnsafe?: {
    user?: {
      id?: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    start_param?: string;
  };
  themeParams?: Record<string, string>;
  colorScheme?: "light" | "dark";
  platform?: string;
  safeAreaInset?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  contentSafeAreaInset?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const getTelegramWebApp = () => window.Telegram?.WebApp ?? null;

export const getTg = () => getTelegramWebApp();

export type TelegramUser = {
  id: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
};

export function getTelegramUser(): TelegramUser | null {
  const raw = getTg()?.initDataUnsafe?.user;
  if (!raw || typeof raw.id !== "number") return null;

  const username = typeof raw.username === "string" && raw.username.trim()
    ? raw.username.trim()
    : null;
  const firstName = typeof raw.first_name === "string" && raw.first_name.trim()
    ? raw.first_name.trim()
    : null;
  const lastName = typeof raw.last_name === "string" && raw.last_name.trim()
    ? raw.last_name.trim()
    : null;

  return {
    id: raw.id,
    username,
    firstName,
    lastName,
  };
}

export function getTelegramStartParam(): string | null {
  const tg = getTg();
  const fromUnsafe = tg?.initDataUnsafe?.start_param;
  if (typeof fromUnsafe === "string" && fromUnsafe.trim()) {
    return fromUnsafe.trim();
  }

  const initData = String(tg?.initData ?? "").trim();
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const fromInitData = params.get("start_param");
  if (typeof fromInitData === "string" && fromInitData.trim()) {
    return fromInitData.trim();
  }

  return null;
}

export function initTelegramWebApp() {
  const tg = getTg();
  if (!tg) return;

  const applySafeArea = () => {
    const safeArea = tg.contentSafeAreaInset ?? tg.safeAreaInset;
    if (!safeArea) return;

    const root = document.documentElement;
    const top = Number(safeArea.top ?? 0);
    const bottom = Number(safeArea.bottom ?? 0);

    root.style.setProperty("--tg-safe-top", `${Math.max(0, top)}px`);
    root.style.setProperty("--tg-safe-bottom", `${Math.max(0, bottom)}px`);
  };

  tg?.ready?.();
  tg?.expand?.();
  if (typeof tg.requestFullscreen === "function") {
    try {
      const maybePromise = tg.requestFullscreen();
      Promise.resolve(maybePromise).catch((error) => {
        console.log("[telegram] requestFullscreen rejected", error);
      });
    } catch (error) {
      console.log("[telegram] requestFullscreen unsupported", error);
    }
  }
  tg?.disableVerticalSwipes?.();
  tg?.setHeaderColor?.("#ffffff");
  tg?.setBackgroundColor?.("#ffffff");
  applySafeArea();
  tg?.onEvent?.("safe_area_changed", applySafeArea);
  tg?.onEvent?.("viewport_changed", applySafeArea);
}

export function closeTelegramWebApp() {
  const tg = getTg();
  tg?.close?.();
}

export function getTelegramThemeMode(): "light" | "dark" | null {
  const tg = getTg();
  return tg?.colorScheme ?? null;
}

// опционально: прокидываем tg цвета в css vars
export function applyTelegramThemeVars() {
  const tg = getTg();
  const p = tg?.themeParams;
  if (!p) return;

  const root = document.documentElement;

  // Telegram keys могут различаться, поэтому ставим "если есть"
  if (p.bg_color) root.style.setProperty("--tg-bg", p.bg_color);
  if (p.text_color) root.style.setProperty("--tg-text", p.text_color);
  if (p.hint_color) root.style.setProperty("--tg-hint", p.hint_color);
  if (p.button_color) root.style.setProperty("--tg-btn", p.button_color);
  if (p.button_text_color) root.style.setProperty("--tg-btn-text", p.button_text_color);
}
