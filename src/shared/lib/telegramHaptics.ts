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

type TabHapticVariant = "home" | "catalog" | "favorites" | "default";

export function triggerHapticTabPress(variant: TabHapticVariant = "default"): void {
  try {
    const telegram = (window as Window & { Telegram?: TelegramGlobal }).Telegram;
    const haptics = telegram?.WebApp?.HapticFeedback;
    if (!haptics) return;

    if (variant === "home") {
      if (haptics.selectionChanged) {
        haptics.selectionChanged();
        return;
      }
      haptics.impactOccurred?.("light");
      return;
    }

    if (variant === "catalog") {
      haptics.impactOccurred?.("soft");
      return;
    }

    if (variant === "favorites") {
      haptics.impactOccurred?.("light");
      return;
    }

    haptics.impactOccurred?.("light");
  } catch {
    // noop: outside Telegram / unsupported platform
  }
}
