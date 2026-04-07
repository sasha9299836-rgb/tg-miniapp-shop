import { useEffect, type ReactNode } from "react";
import { useAccountStore } from "../../entities/account/model/useAccountStore";
import { useAdminStore } from "../../entities/account/model/useAdminStore";
import { useCartStore } from "../../entities/cart/model/useCartStore";
import { useFavoritesStore } from "../../entities/favorites/model/useFavoritesStore";
import { verifyTelegramIdentity } from "../../shared/api/telegramIdentityApi";
import { upsertTelegramUser } from "../../shared/api/telegramUsersApi";
import TgDebugPanel from "../../shared/debug/TgDebugPanel";
import {
  isTgDebugModeEnabled,
  setLastAuthErrorCode,
  setTgDebugState,
} from "../../shared/debug/tgDebug";
import {
  clearTelegramUserSessionToken,
  getTelegramUserSessionToken,
  refreshTgDebugSessionFlags,
  setTelegramUserSessionToken,
} from "../../shared/auth/tgUserSession";
import { getTelegramUser, getTelegramWebApp, initTelegramWebApp } from "./telegram";

const TELEGRAM_USER_BOOTSTRAP_MAX_ATTEMPTS = 120;
const TELEGRAM_USER_BOOTSTRAP_INTERVAL_MS = 300;
let lastBootstrappedTelegramId: number | null = null;
let bootstrapInFlight = false;
let lastVerifiedTelegramId: number | null = null;
let verifyInFlight = false;

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    let isCancelled = false;
    let attempts = 0;

    initTelegramWebApp();
    setTgDebugState({
      runtimeDetected: Boolean(getTelegramWebApp()),
      initDataPresent: Boolean(String(getTelegramWebApp()?.initData ?? "").trim()),
      initDataLength: String(getTelegramWebApp()?.initData ?? "").trim().length,
    });
    console.log("[tg-user-bootstrap] start");

    const tryBootstrap = async () => {
      if (isCancelled) return;
      if (bootstrapInFlight) return;
      attempts += 1;

      const tgUser = getTelegramUser();
      setTgDebugState({
        runtimeDetected: Boolean(getTelegramWebApp()),
        initDataPresent: Boolean(String(getTelegramWebApp()?.initData ?? "").trim()),
        initDataLength: String(getTelegramWebApp()?.initData ?? "").trim().length,
      });
      if (!tgUser) {
        console.log(`[tg-user-bootstrap] no Telegram user yet (attempt ${attempts}/${TELEGRAM_USER_BOOTSTRAP_MAX_ATTEMPTS})`);
        return;
      }
      if (lastBootstrappedTelegramId === tgUser.id) {
        console.log(`[tg-user-bootstrap] already bootstrapped for telegram_id=${tgUser.id}`);
        return;
      }

      const initData = String(getTelegramWebApp()?.initData ?? "").trim();
      if (initData && !verifyInFlight) {
        setTgDebugState({ verifyRequested: true });
        const hasUserSession = getTelegramUserSessionToken().length > 0;
        if (!hasUserSession || lastVerifiedTelegramId !== tgUser.id) {
          verifyInFlight = true;
          try {
            const session = await verifyTelegramIdentity(initData);
            if (!isCancelled) {
              setTelegramUserSessionToken(session.sessionToken, session.expiresAt);
              refreshTgDebugSessionFlags();
              setTgDebugState({ verifySuccess: true });
              setLastAuthErrorCode(null);
              lastVerifiedTelegramId = session.telegramId;
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "VERIFY_FAILED";
            console.log(`[tg-user-bootstrap] verify failed: ${message}`);
            setTgDebugState({ verifySuccess: false });
            setLastAuthErrorCode(message);
            if (!isCancelled) {
              clearTelegramUserSessionToken();
              refreshTgDebugSessionFlags();
            }
          } finally {
            verifyInFlight = false;
          }
        }
      }
      if (!getTelegramUserSessionToken()) {
        refreshTgDebugSessionFlags();
        return;
      }

      console.log("[tg-user-bootstrap] Telegram user resolved", {
        telegram_id: tgUser.id,
        has_username: Boolean(tgUser.username),
        has_first_name: Boolean(tgUser.firstName),
        has_last_name: Boolean(tgUser.lastName),
      });

      bootstrapInFlight = true;
      try {
        console.log("[tg-user-bootstrap] upsert payload", {
          p_telegram_id: tgUser.id,
          has_username: Boolean(tgUser.username),
          has_first_name: Boolean(tgUser.firstName),
          has_last_name: Boolean(tgUser.lastName),
        });
        const row = await upsertTelegramUser({
          username: tgUser.username,
          firstName: tgUser.firstName,
          lastName: tgUser.lastName,
        });
        console.log("[tg-user-bootstrap] upsert success", {
          telegram_id: row.telegram_id,
          has_username: Boolean(row.telegram_username),
          is_admin: Boolean(row.is_admin),
        });
        if (!isCancelled) {
          try {
            window.localStorage.setItem("tg_user_id", String(row.telegram_id));
          } catch {
            // no-op
          }
          useAdminStore.getState().setDbAdmin(Boolean(row.is_admin));
          setTgDebugState({
            currentUserLoaded: true,
            currentUserTelegramIdPresent: Boolean(row.telegram_id),
            currentUserIsAdmin: Boolean(row.is_admin),
          });
          useAccountStore.getState().applyTelegramProfile({
            telegramId: row.telegram_id,
            telegramUsername: row.telegram_username,
            telegramFirstName: row.telegram_first_name,
            telegramLastName: row.telegram_last_name,
            isAdmin: Boolean(row.is_admin),
            registeredAt: row.registered_at,
          });
          void useFavoritesStore.getState().load();
          void useCartStore.getState().load();
          lastBootstrappedTelegramId = row.telegram_id;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
        console.log(`[tg-user-bootstrap] upsert error: ${message}`);
        setLastAuthErrorCode(message);
      } finally {
        bootstrapInFlight = false;
      }
    };

    const timer = window.setInterval(() => {
      if (attempts >= TELEGRAM_USER_BOOTSTRAP_MAX_ATTEMPTS) {
        console.log("[tg-user-bootstrap] stop: max attempts reached (user not resolved)");
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

    return (
    <>
      {children}
      {isTgDebugModeEnabled() ? <TgDebugPanel /> : null}
    </>
  );
}
