type TelegramLikeWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      initDataUnsafe?: {
        user?: {
          id?: number;
        };
      };
    };
  };
};

function getTelegramWebApp() {
  const tg = (window as TelegramLikeWindow).Telegram;
  return tg?.WebApp;
}

export function hasTelegramRuntime(): boolean {
  return Boolean(getTelegramWebApp());
}

export function hasTelegramInitData(): boolean {
  const initData = getTelegramWebApp()?.initData;
  return typeof initData === "string" && initData.trim().length > 0;
}

export function hasTelegramUser(): boolean {
  const userId = getTelegramWebApp()?.initDataUnsafe?.user?.id;
  return typeof userId === "number" && Number.isFinite(userId) && userId > 0;
}

export function isRealTelegramMiniAppContext(): boolean {
  return hasTelegramInitData() || hasTelegramUser();
}

export function isBrowserAdminDebugMode(): boolean {
  return !isRealTelegramMiniAppContext();
}

export function canUseAdminSessionByContext(isDbAdmin: boolean): boolean {
  return isRealTelegramMiniAppContext() && isDbAdmin;
}

export function getAdminAccessDebugState(isDbAdmin: boolean) {
  const hasRuntime = hasTelegramRuntime();
  const hasInitData = hasTelegramInitData();
  const hasUser = hasTelegramUser();
  const detectedTelegramContext = isRealTelegramMiniAppContext();
  const canUse = canUseAdminSessionByContext(isDbAdmin);
  return {
    detectedTelegramContext,
    hasTelegramRuntime: hasRuntime,
    hasInitData,
    hasTelegramUser: hasUser,
    canUseAdminSessionByContext: canUse,
    isDbAdmin,
  };
}
