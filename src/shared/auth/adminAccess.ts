import { getKnownTgUserId } from "./tgUser";

export const ADMIN_TELEGRAM_ID = 6360613956;

export function isAdminTelegramUserId(telegramId: number | null | undefined): boolean {
  return typeof telegramId === "number" && Number.isInteger(telegramId) && telegramId === ADMIN_TELEGRAM_ID;
}

export function isCurrentAdminTelegramUser(): boolean {
  return isAdminTelegramUserId(getKnownTgUserId());
}
