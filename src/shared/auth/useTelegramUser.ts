import { useMemo } from "react";
import { getTelegramUser, type TelegramUser } from "../../app/providers/telegram";

export function useTelegramUser(): TelegramUser | null {
  return useMemo(() => getTelegramUser(), []);
}

export default useTelegramUser;
