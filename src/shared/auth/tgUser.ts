const TG_USER_ID_KEY = "tg_user_id";
const DEFAULT_TG_USER_ID = 1;

export function getCurrentTgUserId(): number {
  try {
    const telegramRuntimeId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (typeof telegramRuntimeId === "number" && Number.isInteger(telegramRuntimeId) && telegramRuntimeId > 0) {
      window.localStorage.setItem(TG_USER_ID_KEY, String(telegramRuntimeId));
      return telegramRuntimeId;
    }

    const raw = window.localStorage.getItem(TG_USER_ID_KEY);
    if (raw) {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
    window.localStorage.setItem(TG_USER_ID_KEY, String(DEFAULT_TG_USER_ID));
    return DEFAULT_TG_USER_ID;
  } catch {
    return DEFAULT_TG_USER_ID;
  }
}
