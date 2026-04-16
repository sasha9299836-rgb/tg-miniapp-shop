import {
  createSupabaseAdminClient,
  empty,
  getDebugId,
  json,
} from "../_shared/admin.ts";
import { verifyTelegramInitData } from "../_shared/telegramIdentity.ts";
import { createTelegramUserSession } from "../_shared/telegramUserSession.ts";

type VerifyTelegramIdentityBody = {
  initData?: string;
};

function resolveInitDataMaxAgeSeconds(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? "");
  if (!Number.isInteger(parsed) || parsed <= 0) return 86400;
  return Math.min(86400, Math.max(60, parsed));
}

function resolveBotTokenFromEnv() {
  const keys = ["TELEGRAM_BOT_TOKEN", "TG_BOT_TOKEN", "BOT_TOKEN"] as const;
  for (const key of keys) {
    const value = String(Deno.env.get(key) ?? "").trim();
    if (value) return { token: value, source: key };
  }
  return { token: "", source: "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const debugId = getDebugId(req);
    const body = await req.json().catch(() => null) as VerifyTelegramIdentityBody | null;
    const initData = String(body?.initData ?? "").trim();
    console.log(JSON.stringify({
      scope: "tg_verify_telegram_identity",
      event: "request_received",
      debugId: debugId || null,
      hasInitData: Boolean(initData),
      initDataLength: initData.length,
    }));
    if (!initData) return json({ error: "INIT_DATA_REQUIRED" }, 400);

    const tokenFromEnv = resolveBotTokenFromEnv();
    if (!tokenFromEnv.token) {
      console.log(JSON.stringify({
        scope: "tg_verify_telegram_identity",
        event: "bot_token_missing",
        debugId: debugId || null,
      }));
      return json({ error: "BOT_TOKEN_MISSING" }, 500);
    }
    const initDataMaxAgeSeconds = resolveInitDataMaxAgeSeconds(Deno.env.get("TG_INITDATA_MAX_AGE_SECONDS"));
    console.log(JSON.stringify({
      scope: "tg_verify_telegram_identity",
      event: "verification_config",
      debugId: debugId || null,
      botTokenSource: tokenFromEnv.source,
      authDateTtlSeconds: initDataMaxAgeSeconds,
    }));
    const verification = await verifyTelegramInitData(initData, tokenFromEnv.token, initDataMaxAgeSeconds);
    if (!verification.ok) {
      console.log(JSON.stringify({
        scope: "tg_verify_telegram_identity",
        event: "verification_failed",
        debugId: debugId || null,
        reason: verification.reason,
        initDataParsed: verification.diagnostics.initDataParsed,
        authDateValid: verification.diagnostics.authDateValid,
        hashValid: verification.diagnostics.hashValid,
      }));
      return json({ error: "INVALID_TELEGRAM_IDENTITY", reason: verification.reason }, 401);
    }
    console.log(JSON.stringify({
      scope: "tg_verify_telegram_identity",
      event: "verification_passed",
      debugId: debugId || null,
      telegramIdResolved: Number.isFinite(Number(verification.user.id)) && Number(verification.user.id) > 0,
    }));

    const supabase = createSupabaseAdminClient();
    const session = await createTelegramUserSession(supabase, verification.user.id);
    if (!session.ok) {
      console.log(JSON.stringify({
        scope: "tg_verify_telegram_identity",
        event: "session_create_failed",
        debugId: debugId || null,
      }));
      return json({ error: "SESSION_CREATE_FAILED", details: session.error }, 500);
    }
    console.log(JSON.stringify({
      scope: "tg_verify_telegram_identity",
      event: "session_issued",
      debugId: debugId || null,
      sessionIssued: true,
    }));

    return json({
      ok: true,
      session_token: session.token,
      expires_at: session.expiresAt,
      expires_in: session.ttlSeconds,
      telegram_id: verification.user.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
