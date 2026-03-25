import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SERVICE = "s3";
const DEFAULT_REGION = "ru-central1";

const corsHeaders: HeadersInit = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info, x-admin-token",
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

function getRequiredSecret(...keys: string[]) {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  throw new Error(`Missing secret: ${keys.join(" | ")}`);
}

function isSupabaseClientToken(token: string) {
  return token.startsWith("sb_publishable_") || token.startsWith("sb_secret_");
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

function createCanonicalQueryString(queryParams: URLSearchParams): string {
  return [...queryParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join("&");
}

async function createPresignedGetUrl(input: {
  host: string;
  key: string;
  accessKey: string;
  secretKey: string;
  region: string;
  expiresSeconds: string;
}): Promise<string> {
  const { host, key, accessKey, secretKey, region, expiresSeconds } = input;
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
    "GET",
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

function getAdminToken(req: Request) {
  const explicitAdminToken = (req.headers.get("x-admin-token") ?? "").trim();
  if (explicitAdminToken) return explicitAdminToken;

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return "";

  const bearerToken = auth.slice(7).trim();
  if (!bearerToken || isSupabaseClientToken(bearerToken)) return "";
  return bearerToken;
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

    const token = getAdminToken(req);
    if (!token) return json({ error: "UNAUTHORIZED" }, 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: session, error: sessionErr } = await supabase
      .from("tg_admin_sessions")
      .select("token")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (sessionErr) return json({ error: "SESSION_CHECK_FAILED", details: sessionErr.message }, 500);
    if (!session) return json({ error: "UNAUTHORIZED" }, 401);

    const body = await req.json().catch(() => null) as { order_id?: string } | null;
    const orderId = String(body?.order_id ?? "").trim();
    if (!orderId) return json({ error: "BAD_PAYLOAD" }, 400);

    const { data: order, error: orderErr } = await supabase
      .from("tg_orders")
      .select("payment_proof_key")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) return json({ error: "ORDER_LOOKUP_FAILED", details: orderErr.message }, 500);
    const key = String((order as { payment_proof_key?: string } | null)?.payment_proof_key ?? "").trim();
    if (!key) return json({ error: "PROOF_NOT_FOUND" }, 404);

    const host = `${bucket}.storage.yandexcloud.net`;
    const url = await createPresignedGetUrl({
      host,
      key,
      accessKey,
      secretKey,
      region,
      expiresSeconds: "300",
    });
    return json({ url }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
