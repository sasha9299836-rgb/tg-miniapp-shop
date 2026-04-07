import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

const SERVICE = "s3";
const DEFAULT_REGION = "ru-central1";

const corsHeaders: HeadersInit = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info, x-tg-user-session",
  "access-control-max-age": "86400",
};

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

function empty(status = 204) {
  return new Response(null, { status, headers: corsHeaders });
}

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

function sanitizeFileName(name: string) {
  const cleaned = name
    .replace(/[\\/]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 120) || "payment_proof.bin";
}

function getRequiredSecret(...keys: string[]) {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  throw new Error(`Missing secret: ${keys.join(" | ")}`);
}

function createCanonicalQueryString(queryParams: URLSearchParams): string {
  return [...queryParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join("&");
}

async function createPresignedUrl(input: {
  method: "PUT" | "GET";
  host: string;
  key: string;
  accessKey: string;
  secretKey: string;
  region: string;
  expiresSeconds: string;
}): Promise<string> {
  const { method, host, key, accessKey, secretKey, region, expiresSeconds } = input;
  const canonicalUri = `/${key.split("/").map(encodeRfc3986).join("/")}`;
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
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashedCanonicalRequest].join("\n");
  const signingKey = await getSigningKey(secretKey, dateStamp, region);
  const signatureBytes = await hmacSha256Raw(signingKey, stringToSign);
  const signature = toHex(signatureBytes.buffer);

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabaseUrl = getRequiredSecret("SUPABASE_URL", "PROJECT_URL");
    const serviceRoleKey = getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY");
    const accessKey = getRequiredSecret("YC_ACCESS_KEY");
    const secretKey = getRequiredSecret("YC_SECRET_KEY");
    const bucket = getRequiredSecret("YC_BUCKET");
    const region = (Deno.env.get("YC_REGION") ?? DEFAULT_REGION).trim() || DEFAULT_REGION;

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;
    const trustedTgUserId = userSession.tgUserId;

    const body = await req.json().catch(() => null) as
      | { order_id?: string; file_name?: string; content_type?: string }
      | null;

    const orderId = String(body?.order_id ?? "").trim();
    const fileName = sanitizeFileName(String(body?.file_name ?? ""));
    if (!orderId || !fileName) {
      return json({ error: "BAD_PAYLOAD" }, 400);
    }

    const { data: order, error: orderError } = await supabase
      .from("tg_orders")
      .select("id, tg_user_id, status")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) return json({ error: "ORDER_LOOKUP_FAILED", details: orderError.message }, 500);
    if (!order || Number((order as { tg_user_id: number }).tg_user_id) !== trustedTgUserId) {
      return json({ error: "FORBIDDEN" }, 403);
    }

    const ts = Date.now();
    const key = `payments/${orderId}/${ts}_${fileName}`;
    const host = `${bucket}.storage.yandexcloud.net`;
    const url = await createPresignedUrl({
      method: "PUT",
      host,
      key,
      accessKey,
      secretKey,
      region,
      expiresSeconds: "300",
    });

    return json({ url, key }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
