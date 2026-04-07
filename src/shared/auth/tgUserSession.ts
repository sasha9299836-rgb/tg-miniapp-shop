const TG_USER_SESSION_TOKEN_KEY = "tg_user_session_token";
const TG_USER_SESSION_EXPIRES_AT_KEY = "tg_user_session_expires_at";

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
