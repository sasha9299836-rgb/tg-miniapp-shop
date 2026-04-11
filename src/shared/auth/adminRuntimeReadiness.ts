import { TG_ADMIN_SESSION_TOKEN_KEY, useAdminStore } from "../../entities/account/model/useAdminStore";
import { isRealTelegramMiniAppContext } from "./adminAccess";

const ADMIN_RUNTIME_READY_TIMEOUT_MS = 8_000;
const ADMIN_RUNTIME_READY_POLL_MS = 80;
const ADMIN_RUNTIME_POST_READY_DELAY_MS = 100;

let ensureAdminRuntimeInFlight: Promise<string> | null = null;

function readAdminToken(): string {
  try {
    return (window.localStorage.getItem(TG_ADMIN_SESSION_TOKEN_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForVisiblePaint(): Promise<void> {
  if (document.visibilityState === "visible") {
    await new Promise<void>((resolve) => {
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
        return;
      }
      window.setTimeout(resolve, 0);
    });
    return;
  }

  await new Promise<void>((resolve) => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      cleanup();
      resolve();
    };
    const cleanup = () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
  });
}

async function waitUntilReadyOrTimeout(timeoutMs: number): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isRealTelegramMiniAppContext()) {
      await delay(ADMIN_RUNTIME_READY_POLL_MS);
      continue;
    }

    const state = useAdminStore.getState();
    if (state.isLoading) {
      await state.load();
    }

    const token = readAdminToken();
    if (!token) {
      await delay(ADMIN_RUNTIME_READY_POLL_MS);
      continue;
    }

    const refreshed = useAdminStore.getState();
    if (!refreshed.isAdmin) {
      await delay(ADMIN_RUNTIME_READY_POLL_MS);
      continue;
    }

    return token;
  }

  throw new Error("ADMIN_RUNTIME_NOT_READY");
}

export async function ensureAdminRuntimeReady(): Promise<string> {
  const existingToken = readAdminToken();
  const state = useAdminStore.getState();
  if (existingToken && state.isAdmin && isRealTelegramMiniAppContext()) {
    await waitForVisiblePaint();
    await delay(ADMIN_RUNTIME_POST_READY_DELAY_MS);
    return existingToken;
  }

  if (ensureAdminRuntimeInFlight) return ensureAdminRuntimeInFlight;

  ensureAdminRuntimeInFlight = (async () => {
    try {
      await waitForVisiblePaint();
      const token = await waitUntilReadyOrTimeout(ADMIN_RUNTIME_READY_TIMEOUT_MS);
      await delay(ADMIN_RUNTIME_POST_READY_DELAY_MS);
      return token;
    } finally {
      ensureAdminRuntimeInFlight = null;
    }
  })();

  return ensureAdminRuntimeInFlight;
}

