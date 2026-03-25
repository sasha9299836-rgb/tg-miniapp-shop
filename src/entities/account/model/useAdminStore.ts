import { create } from "zustand";
import { adminMe } from "../../../shared/api/adminApi";

export const TG_ADMIN_SESSION_TOKEN_KEY = "tg_admin_session_token";

function isInvalidStoredAdminToken(token: string) {
  return token.startsWith("sb_publishable_") || token.startsWith("sb_secret_");
}

function readSessionToken(): string | null {
  try {
    const token = (window.localStorage.getItem(TG_ADMIN_SESSION_TOKEN_KEY) ?? "").trim();
    if (!token || isInvalidStoredAdminToken(token)) return null;
    return token;
  } catch {
    return null;
  }
}

function writeSessionToken(token: string | null) {
  try {
    const normalizedToken = token?.trim() ?? "";
    if (normalizedToken.length > 0 && !isInvalidStoredAdminToken(normalizedToken)) {
      window.localStorage.setItem(TG_ADMIN_SESSION_TOKEN_KEY, normalizedToken);
    } else {
      window.localStorage.removeItem(TG_ADMIN_SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

type State = {
  isAdmin: boolean;
  isLoading: boolean;
  load: () => Promise<void>;
  setSessionToken: (token: string) => void;
  clearAdmin: () => void;
};

export const useAdminStore = create<State>((set) => ({
  isAdmin: false,
  isLoading: true,
  load: async () => {
    set({ isLoading: true });
    const token = readSessionToken();
    if (!token) {
      set({ isAdmin: false, isLoading: false });
      return;
    }
    try {
      const result = await adminMe(token);
      if (result.is_admin) {
        set({ isAdmin: true, isLoading: false });
        return;
      }
      writeSessionToken(null);
      set({ isAdmin: false, isLoading: false });
    } catch {
      writeSessionToken(null);
      set({ isAdmin: false, isLoading: false });
    }
  },
  setSessionToken: (token: string) => {
    writeSessionToken(token);
    set({ isAdmin: true, isLoading: false });
  },
  clearAdmin: () => {
    writeSessionToken(null);
    set({ isAdmin: false, isLoading: false });
  },
}));
