import { useSyncExternalStore } from "react";

type TgDebugState = {
  debugId: string;
  runtimeDetected: boolean;
  initDataPresent: boolean;
  initDataLength: number;
  verifyRequested: boolean;
  verifySuccess: boolean;
  sessionTokenPresent: boolean;
  sessionExpiresPresent: boolean;
  currentUserLoaded: boolean;
  currentUserTelegramIdPresent: boolean;
  currentUserIsAdmin: boolean;
  lastAuthErrorCode: string | null;
  lastCollectionsErrorCode: string | null;
};

const DEBUG_ID_KEY = "tg_debug_id";
const DEBUG_FLAG_KEY = "tg_debug_mode";
const SESSION_TOKEN_KEY = "tg_user_session_token";
const SESSION_EXPIRES_KEY = "tg_user_session_expires_at";

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function randomHex(bytes = 8): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (value) => value.toString(16).padStart(2, "0")).join("");
}

function readOrCreateDebugId() {
  try {
    const existing = (window.localStorage.getItem(DEBUG_ID_KEY) ?? "").trim();
    if (existing) return existing;
    const next = `dbg_${Date.now().toString(36)}_${randomHex(6)}`;
    window.localStorage.setItem(DEBUG_ID_KEY, next);
    return next;
  } catch {
    return `dbg_${Date.now().toString(36)}_${randomHex(6)}`;
  }
}

function readFlagFromQuery() {
  try {
    const url = new URL(window.location.href);
    const value = (url.searchParams.get("tg_debug") ?? "").trim();
    if (value === "1" || value.toLowerCase() === "true") return true;
  } catch {
    // no-op
  }
  return false;
}

function readLocalFlag() {
  try {
    const raw = (window.localStorage.getItem(DEBUG_FLAG_KEY) ?? "").trim();
    return raw === "1";
  } catch {
    return false;
  }
}

function writeLocalFlag(enabled: boolean) {
  try {
    if (enabled) {
      window.localStorage.setItem(DEBUG_FLAG_KEY, "1");
    } else {
      window.localStorage.removeItem(DEBUG_FLAG_KEY);
    }
  } catch {
    // no-op
  }
}

function readSessionFlags() {
  try {
    const tokenPresent = Boolean((window.localStorage.getItem(SESSION_TOKEN_KEY) ?? "").trim());
    const expiresPresent = Boolean((window.localStorage.getItem(SESSION_EXPIRES_KEY) ?? "").trim());
    return { tokenPresent, expiresPresent };
  } catch {
    return { tokenPresent: false, expiresPresent: false };
  }
}

let debugEnabled = readLocalFlag() || readFlagFromQuery();
if (readFlagFromQuery()) {
  writeLocalFlag(true);
}

const state: TgDebugState = {
  debugId: readOrCreateDebugId(),
  runtimeDetected: false,
  initDataPresent: false,
  initDataLength: 0,
  verifyRequested: false,
  verifySuccess: false,
  sessionTokenPresent: readSessionFlags().tokenPresent,
  sessionExpiresPresent: readSessionFlags().expiresPresent,
  currentUserLoaded: false,
  currentUserTelegramIdPresent: false,
  currentUserIsAdmin: false,
  lastAuthErrorCode: null,
  lastCollectionsErrorCode: null,
};

export function isTgDebugModeEnabled() {
  return debugEnabled;
}

export function enableTgDebugMode(enabled: boolean) {
  debugEnabled = enabled;
  writeLocalFlag(enabled);
  emit();
}

export function getTgDebugId() {
  return state.debugId;
}

export function getTgDebugHeaders() {
  const headers: Record<string, string> = {};
  if (!debugEnabled) return headers;
  headers["x-debug-id"] = state.debugId;
  return headers;
}

export function setTgDebugState(patch: Partial<TgDebugState>) {
  Object.assign(state, patch);
  emit();
}

export function refreshTgDebugSessionFlags() {
  const { tokenPresent, expiresPresent } = readSessionFlags();
  state.sessionTokenPresent = tokenPresent;
  state.sessionExpiresPresent = expiresPresent;
  emit();
}

export function setLastAuthErrorCode(code: string | null) {
  state.lastAuthErrorCode = code;
  emit();
}

export function setLastCollectionsErrorCode(code: string | null) {
  state.lastCollectionsErrorCode = code;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return {
    ...state,
    debugEnabled,
  };
}

export function useTgDebugSnapshot() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
