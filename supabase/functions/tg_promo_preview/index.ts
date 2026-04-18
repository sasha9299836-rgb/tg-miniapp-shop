import { createSupabaseAdminClient, empty, json } from "../_shared/admin.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

type PromoPreviewBody = {
  promo_code?: string | null;
  post_ids?: string[];
  delivery_total_fee_rub?: number | null;
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
    const deliveryTotalFee = Math.max(0, Math.round(Number(body?.delivery_total_fee_rub ?? 0)));
    promoCodeForAttempt = promoCode;

    if (!postIds.length) {
      return json({ ok: false, error: "BAD_PAYLOAD" }, 400);
    }

    if (promoCode) {
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
    }

    const { data: pricingData, error: pricingError } = await supabase.rpc("tg_build_checkout_pricing", {
      p_tg_user_id: currentTgUserId,
      p_post_ids: postIds,
      p_promo_code: promoCode || null,
      p_delivery_total_fee_rub: deliveryTotalFee,
    });
    if (pricingError) {
      const message = String(pricingError.message ?? "").trim();
      if (!message) throw new Error("PROMO_PREVIEW_FAILED");
      if (
        message.includes("PROMO_NOT_FOUND") ||
        message.includes("PROMO_DISABLED") ||
        message.includes("PROMO_EXHAUSTED") ||
        message.includes("PROMO_EXPIRED") ||
        message.includes("PROMO_NOT_STARTED") ||
        message.includes("PROMO_ALREADY_USED_BY_USER") ||
        message.includes("PROMO_NOT_AVAILABLE_FOR_USER") ||
        message.includes("PROMO_POST_NOT_FOUND") ||
        message.includes("PROMO_POST_NOT_PUBLISHED") ||
        message.includes("PROMO_POST_NOT_AVAILABLE")
      ) {
        return json({ ok: false, error: message }, 200);
      }
      throw new Error(message);
    }

    const snapshot = (Array.isArray(pricingData) ? pricingData[0] : pricingData) as Record<string, unknown> | null;
    if (!snapshot || typeof snapshot !== "object") {
      return json({ ok: false, error: "PROMO_PREVIEW_FAILED" }, 200);
    }

    if (promoCode) {
      await writePromoPreviewAttempt(supabase, {
        tgUserId: currentTgUserId,
        promoCode,
        success: true,
      }).catch(() => null);
    }

    return json({
      ok: true,
      promo: snapshot,
    });
  } catch (error) {
    if (supabase && typeof tgUserId === "number" && promoCodeForAttempt) {
      await writePromoPreviewAttempt(supabase, {
        tgUserId,
        promoCode: promoCodeForAttempt,
        success: false,
      }).catch(() => null);
    }
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
