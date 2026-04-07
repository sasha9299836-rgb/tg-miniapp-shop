const textEncoder = new TextEncoder();

type TelegramIdentityUser = {
  id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type TelegramIdentityVerificationResult =
  | {
      ok: true;
      user: TelegramIdentityUser;
      authDate: number;
    }
  | {
      ok: false;
      reason: "MISSING_HASH" | "INVALID_HASH" | "INVALID_AUTH_DATE" | "EXPIRED_AUTH_DATE" | "INVALID_USER";
    };

async function hmacSha256Raw(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(value));
  return new Uint8Array(signature);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseTelegramUser(rawUser: string | null): TelegramIdentityUser | null {
  if (!rawUser) return null;
  try {
    const parsed = JSON.parse(rawUser) as Record<string, unknown>;
    const id = Number(parsed.id);
    if (!Number.isInteger(id) || id <= 0) return null;
    return {
      id,
      username: normalizeString(parsed.username),
      first_name: normalizeString(parsed.first_name),
      last_name: normalizeString(parsed.last_name),
    };
  } catch {
    return null;
  }
}

function parseAuthDate(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function buildDataCheckString(params: URLSearchParams): string {
  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => {
    if (key === "hash") return;
    entries.push([key, value]);
  });
  entries.sort(([left], [right]) => left.localeCompare(right));
  return entries.map(([key, value]) => `${key}=${value}`).join("\n");
}

export async function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
): Promise<TelegramIdentityVerificationResult> {
  const params = new URLSearchParams(initData);
  const hash = String(params.get("hash") ?? "").trim().toLowerCase();
  if (!hash) {
    return { ok: false, reason: "MISSING_HASH" };
  }

  const authDate = parseAuthDate(params.get("auth_date"));
  if (!authDate) {
    return { ok: false, reason: "INVALID_AUTH_DATE" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - authDate) > maxAgeSeconds) {
    return { ok: false, reason: "EXPIRED_AUTH_DATE" };
  }

  const dataCheckString = buildDataCheckString(params);
  const secretKey = await hmacSha256Raw(textEncoder.encode("WebAppData"), botToken);
  const expectedHash = toHex(await hmacSha256Raw(secretKey, dataCheckString));
  if (!safeEqual(expectedHash, hash)) {
    return { ok: false, reason: "INVALID_HASH" };
  }

  const user = parseTelegramUser(params.get("user"));
  if (!user) {
    return { ok: false, reason: "INVALID_USER" };
  }

  return {
    ok: true,
    user,
    authDate,
  };
}
