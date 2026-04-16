import {
  createSupabaseAdminClient,
  empty,
  getOptionalSecret,
  getRequiredSecret,
  json,
  requireAdminSession,
} from "../_shared/admin.ts";

const SERVICE = "s3";
const DEFAULT_REGION = "ru-central1";

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(hash);
}

async function hmacSha256Raw(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sign = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
  return new Uint8Array(sign);
}

function getIsoNow(date: Date) {
  const y = date.getUTCFullYear().toString();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");

  return {
    dateStamp: `${y}${m}${d}`,
    amzDate: `${y}${m}${d}T${hh}${mm}${ss}Z`,
  };
}

async function getSigningKey(secretKey: string, dateStamp: string, region: string): Promise<Uint8Array> {
  const kDate = await hmacSha256Raw(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmacSha256Raw(kDate, region);
  const kService = await hmacSha256Raw(kRegion, SERVICE);
  return await hmacSha256Raw(kService, "aws4_request");
}

function createCanonicalQueryString(queryParams: URLSearchParams): string {
  return [...queryParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join("&");
}

async function createPresignedDeleteUrl(input: {
  host: string;
  key: string;
  accessKey: string;
  secretKey: string;
  region: string;
}): Promise<string> {
  const { host, key, accessKey, secretKey, region } = input;
  const encodedKeyPath = key.split("/").map(encodeRfc3986).join("/");
  const canonicalUri = `/${encodedKeyPath}`;

  const now = new Date();
  const { dateStamp, amzDate } = getIsoNow(now);
  const signedHeaders = "host";
  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": "300",
    "X-Amz-SignedHeaders": signedHeaders,
  });

  const canonicalQueryString = createCanonicalQueryString(queryParams);
  const canonicalRequest = [
    "DELETE",
    canonicalUri,
    canonicalQueryString,
    `host:${host}\n`,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashedCanonicalRequest,
  ].join("\n");

  const signingKey = await getSigningKey(secretKey, dateStamp, region);
  const signatureBytes = await hmacSha256Raw(signingKey, stringToSign);
  const signature = toHex(signatureBytes.buffer);

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

function isAllowedStorageKey(key: string): boolean {
  const itemMain = /^\d+\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const itemDefectLegacy = /^\d+\/defects\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const itemDefectImage = /^\d+\/defects\/images\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const itemDefectVideo = /^\d+\/defects\/videos\/([1-9]|[1-4]\d|50)\.(mp4|mov)$/i;
  const measurementImage = /^measurements\/[0-9a-f-]{36}\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const measurementVideo = /^measurements\/[0-9a-f-]{36}\/videos\/([1-9]|[1-4]\d|50)\.(mp4|mov)$/i;
  const measurementImageAlt = /^items\/[0-9a-f-]{36}\/measurement\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const measurementVideoAlt = /^items\/[0-9a-f-]{36}\/measurement\/videos\/([1-9]|[1-4]\d|50)\.(mp4|mov)$/i;
  const noItemMain = /^no-item\/[0-9a-f-]{36}\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const noItemDefectLegacy = /^no-item\/[0-9a-f-]{36}\/defects\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const noItemDefectImage = /^no-item\/[0-9a-f-]{36}\/defects\/images\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const noItemDefectVideo = /^no-item\/[0-9a-f-]{36}\/defects\/videos\/([1-9]|[1-4]\d|50)\.(mp4|mov)$/i;
  return itemMain.test(key)
    || itemDefectLegacy.test(key)
    || itemDefectImage.test(key)
    || itemDefectVideo.test(key)
    || measurementImage.test(key)
    || measurementVideo.test(key)
    || measurementImageAlt.test(key)
    || measurementVideoAlt.test(key)
    || noItemMain.test(key)
    || noItemDefectLegacy.test(key)
    || noItemDefectImage.test(key)
    || noItemDefectVideo.test(key);
}

function parseAllowedOrigins(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const allowedOriginsRaw = getOptionalSecret("YC_ALLOWED_ORIGINS");
    const allowedOrigins = parseAllowedOrigins(allowedOriginsRaw);
    if (allowedOrigins.size > 0) {
      const requestOrigin = (req.headers.get("origin") ?? "").trim();
      if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
        return json({ error: "FORBIDDEN_ORIGIN" }, 403);
      }
    }

    const supabase = createSupabaseAdminClient();
    const session = await requireAdminSession(supabase, req);
    if (!session.ok) return session.response;

    const accessKey = getRequiredSecret("YC_ACCESS_KEY");
    const secretKey = getRequiredSecret("YC_SECRET_KEY");
    const bucket = getRequiredSecret("YC_BUCKET");
    const region = (Deno.env.get("YC_REGION") ?? DEFAULT_REGION).trim() || DEFAULT_REGION;

    const body = await req.json().catch(() => null) as { key?: unknown } | null;
    const key = typeof body?.key === "string" ? body.key.trim() : "";
    if (!key || key.includes("..") || !isAllowedStorageKey(key)) {
      return json({ error: "BAD_PAYLOAD" }, 400);
    }

    const host = `${bucket}.storage.yandexcloud.net`;
    const url = await createPresignedDeleteUrl({
      host,
      key,
      accessKey,
      secretKey,
      region,
    });

    const response = await fetch(url, { method: "DELETE" });
    if (![200, 204, 404].includes(response.status)) {
      return json({ error: "DELETE_FAILED", status: response.status }, 502);
    }

    return json({ ok: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("Missing secret:")) return json({ error: "SERVER_MISCONFIGURED" }, 500);
    return json({ error: "DELETE_FAILED" }, 500);
  }
});
