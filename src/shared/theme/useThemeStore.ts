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

function applyThemeToDom(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
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
      set({ mode: null, auto });
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
