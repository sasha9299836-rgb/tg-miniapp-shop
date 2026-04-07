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
    if (!token) return "";
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
  if (existing) return existing;

  if (ensureSessionInFlight) return ensureSessionInFlight;

  ensureSessionInFlight = (async () => {
    const current = getTelegramUserSessionToken();
    if (current) return current;

    const initData = await waitForTelegramInitData(3000);
    if (!initData) return "";

    try {
      const { verifyTelegramIdentity } = await import("../api/telegramIdentityApi");
      const verified = await verifyTelegramIdentity(initData);
      setTelegramUserSessionToken(verified.sessionToken, verified.expiresAt);
      try {
        window.localStorage.setItem("tg_user_id", String(verified.telegramId));
      } catch {
        // no-op
      }
      return getTelegramUserSessionToken();
    } catch {
      clearTelegramUserSessionToken();
      return "";
    } finally {
      ensureSessionInFlight = null;
    }
  })();

  return ensureSessionInFlight;
}
