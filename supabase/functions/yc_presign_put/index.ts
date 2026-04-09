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

function extFromContentType(contentType: string): string | null {
  const value = contentType.toLowerCase();
  if (value.includes("image/jpeg") || value.includes("image/jpg")) return "jpg";
  if (value.includes("image/png")) return "png";
  if (value.includes("image/webp")) return "webp";
  if (value.includes("video/mp4")) return "mp4";
  return null;
}

function normalizeExt(ext: string | null): string | null {
  if (!ext) return null;
  const cleaned = ext.toLowerCase().replace(/^\./, "").trim();
  if (!cleaned) return null;
  if (cleaned === "jpeg") return "jpg";
  if (["jpg", "png", "webp", "mp4"].includes(cleaned)) return cleaned;
  return null;
}

function parseItemId(value: unknown): number {
  if (value == null || value === "") return 0;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(num) || num <= 0) return -1;
  return num;
}

function parsePhotoNo(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 50) return -1;
  return num;
}

function parseKind(value: unknown): "main" | "defect" {
  if (value === "defect") return "defect";
  return "main";
}

function isSafePostId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAllowedStorageKey(key: string): boolean {
  const itemMain = /^\d+\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const itemDefectLegacy = /^\d+\/defects\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const itemDefectImage = /^\d+\/defects\/images\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const itemDefectVideo = /^\d+\/defects\/videos\/([1-9]|[1-4]\d|50)\.mp4$/i;
  const noItemMain = /^no-item\/[0-9a-f-]{36}\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const noItemDefectLegacy = /^no-item\/[0-9a-f-]{36}\/defects\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const noItemDefectImage = /^no-item\/[0-9a-f-]{36}\/defects\/images\/([1-9]|[1-4]\d|50)\.(jpg|png|webp)$/i;
  const noItemDefectVideo = /^no-item\/[0-9a-f-]{36}\/defects\/videos\/([1-9]|[1-4]\d|50)\.mp4$/i;
  return itemMain.test(key)
    || itemDefectLegacy.test(key)
    || itemDefectImage.test(key)
    || itemDefectVideo.test(key)
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

function createCanonicalQueryString(queryParams: URLSearchParams): string {
  return [...queryParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join("&");
}

async function createPresignedUrl(input: {
  method: "PUT" | "HEAD";
  host: string;
  key: string;
  accessKey: string;
  secretKey: string;
  region: string;
  expiresSeconds: string;
}): Promise<string> {
  const { method, host, key, accessKey, secretKey, region, expiresSeconds } = input;
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
    "X-Amz-Expires": expiresSeconds,
    "X-Amz-SignedHeaders": signedHeaders,
  });

  const canonicalQueryString = createCanonicalQueryString(queryParams);
  const canonicalRequest = [
    method,
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

async function checkObjectExists(input: {
  host: string;
  key: string;
  accessKey: string;
  secretKey: string;
  region: string;
}) {
  const url = await createPresignedUrl({
    method: "HEAD",
    host: input.host,
    key: input.key,
    accessKey: input.accessKey,
    secretKey: input.secretKey,
    region: input.region,
    expiresSeconds: "60",
  });

  const res = await fetch(url, { method: "HEAD" });
  if (res.status === 200) return { exists: true } as const;
  if (res.status === 404) return { exists: false } as const;
  return { exists: false, failed: true, status: res.status } as const;
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

    const body = await req.json().catch(() => null) as
      | { post_id?: unknown; item_id?: unknown; photo_no?: unknown; content_type?: unknown; ext?: unknown; kind?: unknown }
      | null;

    const postId = typeof body?.post_id === "string" ? body.post_id.trim() : "";
    const itemId = parseItemId(body?.item_id);
    const photoNo = parsePhotoNo(body?.photo_no);
    const contentType = typeof body?.content_type === "string" ? body.content_type : "";
    const kind = parseKind(body?.kind);
    const ext = normalizeExt(typeof body?.ext === "string" ? body.ext : null) ??
      normalizeExt(extFromContentType(contentType));

    if (photoNo <= 0 || !ext || itemId < 0) {
      return json({ error: "BAD_PAYLOAD" }, 400);
    }
    if (kind === "main" && ext === "mp4") return json({ error: "BAD_PAYLOAD" }, 400);
    if (itemId === 0 && !postId) return json({ error: "BAD_PAYLOAD" }, 400);
    if (itemId === 0 && !isSafePostId(postId)) return json({ error: "BAD_PAYLOAD" }, 400);

    const basePrefix = itemId > 0 ? `${itemId}` : `no-item/${postId}`;
    const key = kind === "defect"
      ? `${basePrefix}/defects/${ext === "mp4" ? "videos" : "images"}/${photoNo}.${ext}`
      : `${basePrefix}/${photoNo}.${ext}`;
    if (!isAllowedStorageKey(key)) return json({ error: "BAD_PAYLOAD" }, 400);

    const host = `${bucket}.storage.yandexcloud.net`;
    const publicUrl = `https://${host}/${key}`;

    const objectState = await checkObjectExists({ host, key, accessKey, secretKey, region });
    if ("failed" in objectState) {
      return json({ error: "OBJECT_CHECK_FAILED", status: objectState.status }, 502);
    }
    if (objectState.exists) {
      return json({ error: "ALREADY_EXISTS" }, 409);
    }

    const url = await createPresignedUrl({
      method: "PUT",
      host,
      key,
      accessKey,
      secretKey,
      region,
      expiresSeconds: "300",
    });

    return json({ url, key, publicUrl }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message.startsWith("Missing secret:")) return json({ error: "SERVER_MISCONFIGURED" }, 500);
    return json({ error: "PRESIGN_FAILED" }, 500);
  }
});
