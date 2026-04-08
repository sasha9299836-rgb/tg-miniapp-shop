const TELEGRAM_BOT_USERNAME = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? "aesisland_bot")
  .trim()
  .replace(/^@+/, "");
const TELEGRAM_MINIAPP_SHORT_NAME = String(import.meta.env.VITE_TELEGRAM_MINIAPP_SHORT_NAME ?? "")
  .trim()
  .replace(/^\/+|\/+$/g, "");
const TELEGRAM_STARTAPP_PREFIX = String(import.meta.env.VITE_TELEGRAM_MINIAPP_STARTAPP_PREFIX ?? "item_").trim();

export function buildTelegramMiniAppProductLink(productRef: string | number | null | undefined): string {
  const productId = String(productRef ?? "").trim();
  if (!productId || !TELEGRAM_BOT_USERNAME) return "";

  const startapp = `${TELEGRAM_STARTAPP_PREFIX}${productId}`;
  const appPath = TELEGRAM_MINIAPP_SHORT_NAME ? `/${TELEGRAM_MINIAPP_SHORT_NAME}` : "";
  return `https://t.me/${TELEGRAM_BOT_USERNAME}${appPath}?startapp=${encodeURIComponent(startapp)}`;
}

