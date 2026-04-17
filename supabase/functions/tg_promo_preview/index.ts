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

function normalizePostIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;

    const body = (await req.json().catch(() => null)) as PromoPreviewBody | null;
    const postIds = normalizePostIds(body?.post_ids);
    const promoCode = String(body?.promo_code ?? "").trim();

    if (!postIds.length || !promoCode) {
      return json({ ok: false, error: "BAD_PAYLOAD" }, 400);
    }

    const subtotalWithoutDiscount = await resolveSubtotalByPosts(supabase, postIds);
    const snapshot = await validatePromoForUserAndSubtotal({
      supabase,
      tgUserId: userSession.tgUserId,
      promoCode,
      subtotalWithoutDiscountRub: subtotalWithoutDiscount,
    });

    return json({
      ok: true,
      promo: snapshot,
    });
  } catch (error) {
    if (error instanceof PromoValidationError) {
      return json({ ok: false, error: error.code }, 200);
    }
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
