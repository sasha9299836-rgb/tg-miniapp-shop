import { create } from "zustand";
import { adminMe } from "../../../shared/api/adminApi";
import { canUseAdminSessionByContext } from "../../../shared/auth/adminAccess";

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
  isDbAdmin: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  load: () => Promise<void>;
  setDbAdmin: (value: boolean) => void;
  setSessionToken: (token: string) => void;
  clearAdmin: () => void;
};

export const useAdminStore = create<State>((set) => ({
  isDbAdmin: false,
  isAdmin: false,
  isLoading: true,
  load: async () => {
    set({ isLoading: true });
    const { isDbAdmin } = useAdminStore.getState();
    if (!canUseAdminSessionByContext(isDbAdmin)) {
      writeSessionToken(null);
      set({ isAdmin: false, isLoading: false });
      return;
    }
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
  setDbAdmin: (value: boolean) => {
    if (!value) {
      writeSessionToken(null);
      set({ isDbAdmin: false, isAdmin: false, isLoading: false });
      return;
    }
    set({ isDbAdmin: true });
  },
  setSessionToken: (token: string) => {
    const { isDbAdmin } = useAdminStore.getState();
    if (!canUseAdminSessionByContext(isDbAdmin)) {
      writeSessionToken(null);
      set({ isAdmin: false, isLoading: false });
      return;
    }
    writeSessionToken(token);
    set({ isAdmin: true, isLoading: false });
  },
  clearAdmin: () => {
    writeSessionToken(null);
    set({ isAdmin: false, isLoading: false });
  },
}));
