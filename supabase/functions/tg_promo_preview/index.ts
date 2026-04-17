import { createSupabaseAdminClient, empty, json } from "../_shared/admin.ts";
import {
  PromoValidationError,
  resolveSubtotalByPosts,
  validatePromoForUserAndSubtotal,
} from "../_shared/promo.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

type PromoPreviewBody = {
  promo_code?: string | null;
  post_ids?: string[];
};

const FAILED_ATTEMPTS_WINDOW_SECONDS = 600;
const FAILED_ATTEMPTS_LIMIT = 8;
const FAILED_ATTEMPTS_COOLDOWN_SECONDS = 300;

function normalizePostIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

async function readPromoPreviewThrottleState(
  supabase: any,
  tgUserId: number,
): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
  const failedSinceIso = new Date(Date.now() - FAILED_ATTEMPTS_WINDOW_SECONDS * 1000).toISOString();
  const { data, error } = await supabase
    .from("tg_promo_preview_attempts")
    .select("attempted_at")
    .eq("tg_user_id", tgUserId)
    .eq("success", false)
    .gte("attempted_at", failedSinceIso)
    .order("attempted_at", { ascending: false })
    .limit(FAILED_ATTEMPTS_LIMIT);

  if (error) {
    throw new Error(`PROMO_PREVIEW_THROTTLE_LOOKUP_FAILED:${error.message}`);
  }

  const failedAttempts = Array.isArray(data) ? data.length : 0;
  if (failedAttempts < FAILED_ATTEMPTS_LIMIT) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  const latestAttemptIso = String(data?.[0]?.attempted_at ?? "");
  const latestAttemptMs = new Date(latestAttemptIso).getTime();
  if (!Number.isFinite(latestAttemptMs)) {
    return { blocked: true, retryAfterSeconds: FAILED_ATTEMPTS_COOLDOWN_SECONDS };
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((latestAttemptMs + FAILED_ATTEMPTS_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000),
  );
  if (retryAfterSeconds <= 0) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  return { blocked: true, retryAfterSeconds };
}

async function writePromoPreviewAttempt(
  supabase: any,
  input: { tgUserId: number; promoCode: string; success: boolean },
) {
  await supabase.from("tg_promo_preview_attempts").insert({
    tg_user_id: input.tgUserId,
    promo_code: input.promoCode,
    success: input.success,
    attempted_at: new Date().toISOString(),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let supabase: any = null;
  let tgUserId: number | null = null;
  let promoCodeForAttempt = "";

  try {
    supabase = createSupabaseAdminClient();
    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;
    tgUserId = userSession.tgUserId;
    const currentTgUserId = userSession.tgUserId;

    const body = (await req.json().catch(() => null)) as PromoPreviewBody | null;
    const postIds = normalizePostIds(body?.post_ids);
    const promoCode = String(body?.promo_code ?? "").trim();
    promoCodeForAttempt = promoCode;

    if (!postIds.length || !promoCode) {
      return json({ ok: false, error: "BAD_PAYLOAD" }, 400);
    }

    const throttle = await readPromoPreviewThrottleState(supabase, currentTgUserId);
    if (throttle.blocked) {
      await writePromoPreviewAttempt(supabase, {
        tgUserId: currentTgUserId,
        promoCode,
        success: false,
      }).catch(() => null);
      return json({
        ok: false,
        error: "PROMO_RATE_LIMITED",
        retry_after_seconds: throttle.retryAfterSeconds,
      }, 200);
    }

    const subtotalWithoutDiscount = await resolveSubtotalByPosts(supabase, postIds);
    const snapshot = await validatePromoForUserAndSubtotal({
      supabase,
      tgUserId: currentTgUserId,
      promoCode,
      subtotalWithoutDiscountRub: subtotalWithoutDiscount,
    });

    await writePromoPreviewAttempt(supabase, {
      tgUserId: currentTgUserId,
      promoCode,
      success: true,
    }).catch(() => null);

    return json({
      ok: true,
      promo: snapshot,
    });
  } catch (error) {
    if (error instanceof PromoValidationError) {
      if (supabase && typeof tgUserId === "number" && promoCodeForAttempt) {
        await writePromoPreviewAttempt(supabase, {
          tgUserId,
          promoCode: promoCodeForAttempt,
          success: false,
        }).catch(() => null);
      }
    }
    if (error instanceof PromoValidationError) {
      return json({ ok: false, error: error.code }, 200);
    }
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
