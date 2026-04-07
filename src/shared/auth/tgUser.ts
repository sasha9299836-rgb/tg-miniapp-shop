const TG_USER_ID_KEY = "tg_user_id";

export const TG_IDENTITY_REQUIRED_ERROR = "TG_IDENTITY_REQUIRED";
export const TG_IDENTITY_REQUIRED_MESSAGE = "Действие доступно только внутри Telegram Mini App с авторизованным пользователем.";

export function getKnownTgUserId(): number | null {
  try {
    const telegramRuntimeId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (typeof telegramRuntimeId === "number" && Number.isInteger(telegramRuntimeId) && telegramRuntimeId > 0) {
      window.localStorage.setItem(TG_USER_ID_KEY, String(telegramRuntimeId));
      return telegramRuntimeId;
    }

    const initData = String(window.Telegram?.WebApp?.initData ?? "").trim();
    if (initData) {
      const params = new URLSearchParams(initData);
      const rawUser = String(params.get("user") ?? "").trim();
      if (rawUser) {
        const parsedUser = JSON.parse(rawUser) as { id?: unknown };
        const initDataId = Number(parsedUser?.id);
        if (Number.isInteger(initDataId) && initDataId > 0) {
          window.localStorage.setItem(TG_USER_ID_KEY, String(initDataId));
          return initDataId;
        }
      }
    }

    const raw = window.localStorage.getItem(TG_USER_ID_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function getCurrentTgUserId(): number {
  const known = getKnownTgUserId();
  return known ?? 0;
}

export function requireCurrentTgUserId(): number {
  const known = getKnownTgUserId();
  if (known) return known;
  throw new Error(TG_IDENTITY_REQUIRED_ERROR);
}

export function isTgIdentityRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message === TG_IDENTITY_REQUIRED_ERROR;
}
