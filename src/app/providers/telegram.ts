export type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  initData?: string;
  initDataUnsafe?: any;
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
