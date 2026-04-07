import {
  createSupabaseAdminClient,
  empty,
  getRequiredSecret,
  json,
} from "../_shared/admin.ts";
import { verifyTelegramInitData } from "../_shared/telegramIdentity.ts";
import { createTelegramUserSession } from "../_shared/telegramUserSession.ts";

type VerifyTelegramIdentityBody = {
  initData?: string;
};

function resolveInitDataMaxAgeSeconds(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? "");
  if (!Number.isInteger(parsed) || parsed <= 0) return 900;
  return Math.min(86400, Math.max(60, parsed));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = await req.json().catch(() => null) as VerifyTelegramIdentityBody | null;
    const initData = String(body?.initData ?? "").trim();
    if (!initData) return json({ error: "INIT_DATA_REQUIRED" }, 400);

    const botToken = getRequiredSecret("TELEGRAM_BOT_TOKEN", "TG_BOT_TOKEN", "BOT_TOKEN");
    const initDataMaxAgeSeconds = resolveInitDataMaxAgeSeconds(Deno.env.get("TG_INITDATA_MAX_AGE_SECONDS"));
    const verification = await verifyTelegramInitData(initData, botToken, initDataMaxAgeSeconds);
    if (!verification.ok) {
      return json({ error: "INVALID_TELEGRAM_IDENTITY" }, 401);
    }

    const supabase = createSupabaseAdminClient();
    const session = await createTelegramUserSession(supabase, verification.user.id);
    if (!session.ok) {
      return json({ error: "SESSION_CREATE_FAILED", details: session.error }, 500);
    }

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
