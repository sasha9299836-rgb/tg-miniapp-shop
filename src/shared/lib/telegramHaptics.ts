type TelegramHapticFeedback = {
  impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  selectionChanged?: () => void;
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
    const haptics = telegram?.WebApp?.HapticFeedback;
    if (haptics?.selectionChanged) {
      haptics.selectionChanged();
      return;
    }
    haptics?.impactOccurred?.("light");
  } catch {
    // noop: outside Telegram / unsupported platform
  }
}
