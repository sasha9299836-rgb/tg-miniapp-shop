import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const vars: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    vars[key] = value;
  }

  return vars;
}

export default defineConfig(({ mode }) => {
  const root = process.cwd();
  const sharedEnv = readEnvFile(path.resolve(root, ".env.shared"));
  const viteEnv = loadEnv(mode, root, "VITE_");
  const merged = { ...sharedEnv, ...viteEnv };

  // Security: expose only explicit public keys to import.meta.env.
  // Any accidental VITE_* secret in env files will be ignored by default.
  const PUBLIC_VITE_KEYS = new Set([
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_CDEK_PROXY_BASE_URL",
    "VITE_CDEK_PROXY_BASE",
    "VITE_CDEK_PROXY_URL",
    "VITE_CDEK_PROXY_TARGET",
  ]);

  const defineEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (!PUBLIC_VITE_KEYS.has(key)) continue;
    defineEnv[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  const rawBaseUrl = String(merged.VITE_CDEK_PROXY_BASE_URL ?? "").trim();
  const explicitProxyTarget = String(merged.VITE_CDEK_PROXY_TARGET ?? "").trim();
  let proxyTarget = explicitProxyTarget;
  if (!proxyTarget && rawBaseUrl) {
    try {
      proxyTarget = new URL(rawBaseUrl).origin;
    } catch {
      proxyTarget = "";
    }
  }
  if (!proxyTarget) {
    proxyTarget = "http://127.0.0.1:8787";
  }

  return {
    plugins: [react()],
    define: defineEnv,
    server: {
      allowedHosts: true,
      proxy: {
        "/api/cdek": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
