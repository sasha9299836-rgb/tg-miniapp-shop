import { useEffect, type ReactNode } from "react";
import { useAccountStore } from "../../entities/account/model/useAccountStore";
import { upsertTelegramUser } from "../../shared/api/telegramUsersApi";
import { getTelegramUser, initTelegramWebApp } from "./telegram";

let telegramUserBootstrapPromise: Promise<void> | null = null;

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    initTelegramWebApp();

    if (!telegramUserBootstrapPromise) {
      telegramUserBootstrapPromise = (async () => {
        const tgUser = getTelegramUser();
        if (!tgUser) return;

        const row = await upsertTelegramUser({
          telegramId: tgUser.id,
          username: tgUser.username,
          firstName: tgUser.firstName,
          lastName: tgUser.lastName,
        });

        useAccountStore.getState().applyTelegramProfile({
          telegramId: row.telegram_id,
          telegramUsername: row.telegram_username,
          telegramFirstName: row.telegram_first_name,
          telegramLastName: row.telegram_last_name,
          registeredAt: row.registered_at,
        });
      })().catch((error) => {
        const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
        console.log(`[tg-user-bootstrap] ${message}`);
      });
    }
  }, []);

  return <>{children}</>;
}
