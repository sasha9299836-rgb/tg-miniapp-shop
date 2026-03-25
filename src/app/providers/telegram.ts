export type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
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
  };
  themeParams?: Record<string, string>;
  colorScheme?: "light" | "dark";
  platform?: string;
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

export function initTelegramWebApp() {
  const tg = getTg();
  tg?.ready?.();
  tg?.expand?.();
  tg?.disableVerticalSwipes?.();
  tg?.setHeaderColor?.("#ffffff");
  tg?.setBackgroundColor?.("#ffffff");
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
