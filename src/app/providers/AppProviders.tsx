import { useEffect, type ReactNode } from "react";
import { useAccountStore } from "../../entities/account/model/useAccountStore";
import { upsertTelegramUser } from "../../shared/api/telegramUsersApi";
import { getTelegramUser, initTelegramWebApp } from "./telegram";

const TELEGRAM_USER_BOOTSTRAP_MAX_ATTEMPTS = 25;
const TELEGRAM_USER_BOOTSTRAP_INTERVAL_MS = 300;
let lastBootstrappedTelegramId: number | null = null;
let bootstrapInFlight = false;

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    let isCancelled = false;
    let attempts = 0;

    initTelegramWebApp();
    useAccountStore.getState().setTelegramDebug({ status: "started", upsertError: null });
    console.log("[tg-user-bootstrap] start");

    const tryBootstrap = async () => {
      if (isCancelled) return;
      if (bootstrapInFlight) return;
      attempts += 1;

      const tgUser = getTelegramUser();
      if (!tgUser) {
        useAccountStore.getState().setTelegramDebug({ status: "no_user" });
        console.log(`[tg-user-bootstrap] no Telegram user yet (attempt ${attempts}/${TELEGRAM_USER_BOOTSTRAP_MAX_ATTEMPTS})`);
        return;
      }
      if (lastBootstrappedTelegramId === tgUser.id) {
        console.log(`[tg-user-bootstrap] already bootstrapped for telegram_id=${tgUser.id}`);
        return;
      }

      console.log("[tg-user-bootstrap] Telegram user resolved", {
        telegram_id: tgUser.id,
        username: tgUser.username,
        first_name: tgUser.firstName,
        last_name: tgUser.lastName,
      });

      bootstrapInFlight = true;
      try {
        useAccountStore.getState().setTelegramDebug({ status: "upsert_started", upsertError: null });
        console.log("[tg-user-bootstrap] upsert payload", {
          p_telegram_id: tgUser.id,
          p_telegram_username: tgUser.username,
          p_telegram_first_name: tgUser.firstName,
          p_telegram_last_name: tgUser.lastName,
        });
        const row = await upsertTelegramUser({
          telegramId: tgUser.id,
          username: tgUser.username,
          firstName: tgUser.firstName,
          lastName: tgUser.lastName,
        });
        console.log("[tg-user-bootstrap] upsert success", row);
        if (!isCancelled) {
          useAccountStore.getState().applyTelegramProfile({
            telegramId: row.telegram_id,
            telegramUsername: row.telegram_username,
            telegramFirstName: row.telegram_first_name,
            telegramLastName: row.telegram_last_name,
            registeredAt: row.registered_at,
          });
          useAccountStore.getState().setTelegramDebug({ status: "upsert_success", upsertError: null });
          lastBootstrappedTelegramId = row.telegram_id;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
        useAccountStore.getState().setTelegramDebug({ status: "upsert_error", upsertError: message });
        console.log(`[tg-user-bootstrap] upsert error: ${message}`);
      } finally {
        bootstrapInFlight = false;
      }
    };

    const timer = window.setInterval(() => {
      if (attempts >= TELEGRAM_USER_BOOTSTRAP_MAX_ATTEMPTS) {
        console.log("[tg-user-bootstrap] stop: max attempts reached");
        window.clearInterval(timer);
        return;
      }
      void tryBootstrap().then(() => {
        if (lastBootstrappedTelegramId !== null) {
          window.clearInterval(timer);
          console.log("[tg-user-bootstrap] stop: completed");
        }
      });
    }, TELEGRAM_USER_BOOTSTRAP_INTERVAL_MS);

    void tryBootstrap();

    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return <>{children}</>;
}
