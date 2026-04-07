import { setTgDebugState } from "../debug/tgDebug";

const TG_USER_SESSION_TOKEN_KEY = "tg_user_session_token";
const TG_USER_SESSION_EXPIRES_AT_KEY = "tg_user_session_expires_at";
let ensureSessionInFlight: Promise<string> | null = null;

function isFutureIsoDate(value: string): boolean {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export function getTelegramUserSessionToken(): string {
  try {
    const token = (window.localStorage.getItem(TG_USER_SESSION_TOKEN_KEY) ?? "").trim();
    if (!token) {
      return "";
    }
    const expiresAt = (window.localStorage.getItem(TG_USER_SESSION_EXPIRES_AT_KEY) ?? "").trim();
    if (!isFutureIsoDate(expiresAt)) {
      window.localStorage.removeItem(TG_USER_SESSION_TOKEN_KEY);
      window.localStorage.removeItem(TG_USER_SESSION_EXPIRES_AT_KEY);
      return "";
    }
    return token;
  } catch {
    return "";
  }
}

export function setTelegramUserSessionToken(token: string, expiresAt: string) {
  const normalizedToken = token.trim();
  const normalizedExpiresAt = expiresAt.trim();
  try {
    if (!normalizedToken || !isFutureIsoDate(normalizedExpiresAt)) {
      window.localStorage.removeItem(TG_USER_SESSION_TOKEN_KEY);
      window.localStorage.removeItem(TG_USER_SESSION_EXPIRES_AT_KEY);
      return;
    }
    window.localStorage.setItem(TG_USER_SESSION_TOKEN_KEY, normalizedToken);
    window.localStorage.setItem(TG_USER_SESSION_EXPIRES_AT_KEY, normalizedExpiresAt);
  } catch {
    // no-op
  }
}

export function clearTelegramUserSessionToken() {
  try {
    window.localStorage.removeItem(TG_USER_SESSION_TOKEN_KEY);
    window.localStorage.removeItem(TG_USER_SESSION_EXPIRES_AT_KEY);
  } catch {
    // no-op
  }
}

export function refreshTgDebugSessionFlags() {
  try {
    const tokenPresent = Boolean((window.localStorage.getItem(TG_USER_SESSION_TOKEN_KEY) ?? "").trim());
    const expiresPresent = Boolean((window.localStorage.getItem(TG_USER_SESSION_EXPIRES_AT_KEY) ?? "").trim());
    setTgDebugState({
      sessionTokenPresent: tokenPresent,
      sessionExpiresPresent: expiresPresent,
    });
  } catch {
    setTgDebugState({
      sessionTokenPresent: false,
      sessionExpiresPresent: false,
    });
  }
}


async function waitForTelegramInitData(timeoutMs: number): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const initData = String(window.Telegram?.WebApp?.initData ?? "").trim();
      if (initData) return initData;
    } catch {
      // no-op
    }
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
  return "";
}

export async function ensureTelegramUserSessionToken(): Promise<string> {
  const existing = getTelegramUserSessionToken();
  if (existing) {
    console.log("[tg-session] ensure: existing token");
    return existing;
  }

  if (ensureSessionInFlight) return ensureSessionInFlight;

  ensureSessionInFlight = (async () => {
    const current = getTelegramUserSessionToken();
    if (current) {
      console.log("[tg-session] ensure: token appeared in-flight");
      return current;
    }

    const initData = await waitForTelegramInitData(3000);
    if (!initData) {
      console.log("[tg-session] ensure: initData missing after wait");
      refreshTgDebugSessionFlags();
      return "";
    }

    try {
      const { verifyTelegramIdentity } = await import("../api/telegramIdentityApi");
      const verified = await verifyTelegramIdentity(initData);
      // Prefer relative ttl when present to avoid client clock skew issues with absolute expires_at.
      const effectiveExpiresAt = Number.isInteger(verified.expiresIn) && verified.expiresIn > 0
        ? new Date(Date.now() + verified.expiresIn * 1000).toISOString()
        : verified.expiresAt;
      setTelegramUserSessionToken(verified.sessionToken, effectiveExpiresAt);
      try {
        window.localStorage.setItem("tg_user_id", String(verified.telegramId));
      } catch {
        // no-op
      }
      const savedToken = getTelegramUserSessionToken();
      refreshTgDebugSessionFlags();
      console.log("[tg-session] ensure: verify success", {
        telegramId: verified.telegramId,
        tokenSaved: Boolean(savedToken),
      });
      return savedToken;
    } catch {
      console.log("[tg-session] ensure: verify failed");
      clearTelegramUserSessionToken();
      refreshTgDebugSessionFlags();
      return "";
    } finally {
      ensureSessionInFlight = null;
    }
  })();

  return ensureSessionInFlight;
}
