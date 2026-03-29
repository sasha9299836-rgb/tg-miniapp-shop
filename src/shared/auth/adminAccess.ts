export function hasTelegramRuntime(): boolean {
  const tg = (window as Window & { Telegram?: { WebApp?: unknown } }).Telegram;
  return Boolean(tg?.WebApp);
}

export function isBrowserAdminDebugMode(): boolean {
  return !hasTelegramRuntime();
}

export function canUseAdminSessionByContext(isDbAdmin: boolean): boolean {
  if (isDbAdmin) return true;
  return isBrowserAdminDebugMode();
}
