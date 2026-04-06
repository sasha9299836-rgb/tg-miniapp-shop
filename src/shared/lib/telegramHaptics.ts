type TelegramHapticFeedback = {
  impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
};

type TelegramWebApp = {
  HapticFeedback?: TelegramHapticFeedback;
};

type TelegramGlobal = {
  WebApp?: TelegramWebApp;
};

export function triggerHapticTabPress(): void {
  try {
    const telegram = (window as Window & { Telegram?: TelegramGlobal }).Telegram;
    telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
  } catch {
    // noop: outside Telegram / unsupported platform
  }
}

