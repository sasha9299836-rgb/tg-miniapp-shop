import { useEffect, useState } from "react";
import { getTelegramUser, type TelegramUser } from "../../app/providers/telegram";

const TELEGRAM_USER_HOOK_MAX_ATTEMPTS = 25;
const TELEGRAM_USER_HOOK_INTERVAL_MS = 300;

export function useTelegramUser(): TelegramUser | null {
  const [user, setUser] = useState<TelegramUser | null>(() => getTelegramUser());

  useEffect(() => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const nextUser = getTelegramUser();
      if (nextUser) {
        setUser((current) => (current?.id === nextUser.id ? current : nextUser));
        window.clearInterval(timer);
        return;
      }
      if (attempts >= TELEGRAM_USER_HOOK_MAX_ATTEMPTS) {
        window.clearInterval(timer);
      }
    }, TELEGRAM_USER_HOOK_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  return user;
}

export default useTelegramUser;
