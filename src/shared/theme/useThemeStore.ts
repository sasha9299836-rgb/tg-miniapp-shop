import { create } from "zustand";

export type ThemeMode = "light" | "dark";

type State = {
  mode: ThemeMode | null;
  auto: boolean; // если true — можно синкаться с Telegram
  setMode: (mode: ThemeMode) => void;
  setAuto: (auto: boolean) => void;
  hydrate: () => void;
};

const STORAGE_KEY = "tg-miniapp-theme";
const STORAGE_AUTO = "tg-miniapp-theme-auto";

function detectSystemTheme(): ThemeMode {
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyThemeToDom(mode: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.colorScheme = mode;

  const body = document.body;
  if (body) {
    body.dataset.theme = mode;
    body.style.colorScheme = mode;
  }
}

export const useThemeStore = create<State>((set) => ({
  mode: null,
  auto: true,

  hydrate: () => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const savedAuto = localStorage.getItem(STORAGE_AUTO);
    const auto = savedAuto === null ? true : savedAuto === "true";

    if (saved === "light" || saved === "dark") {
      applyThemeToDom(saved);
      set({ mode: saved, auto });
    } else {
      const detected = detectSystemTheme();
      applyThemeToDom(detected);
      set({ mode: detected, auto });
    }
  },

  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    applyThemeToDom(mode);
    set({ mode });
  },

  setAuto: (auto) => {
    localStorage.setItem(STORAGE_AUTO, String(auto));
    set({ auto });
  },
}));
