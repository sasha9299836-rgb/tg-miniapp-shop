const DEFAULT_PUBLIC_CDEK_PROXY_BASE_URL = "https://api.aesisland.ru";

function normalizeBase(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\/+$/, "");
}

export function getCdekProxyBaseUrl(): string {
  const env = (import.meta as { env?: Record<string, unknown> }).env ?? {};
  return (
    normalizeBase(env.VITE_CDEK_PROXY_BASE_URL) ||
    normalizeBase(env.VITE_CDEK_PROXY_BASE) ||
    normalizeBase(env.VITE_CDEK_PROXY_URL) ||
    DEFAULT_PUBLIC_CDEK_PROXY_BASE_URL
  );
}

