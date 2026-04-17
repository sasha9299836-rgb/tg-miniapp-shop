import {
  createSupabaseAdminClient,
  empty,
  json,
} from "../_shared/admin.ts";
import {
  PromoValidationError,
  resolveSubtotalByPosts,
  validatePromoForUserAndSubtotal,
} from "../_shared/promo.ts";
import { requireTelegramUserSession } from "../_shared/telegramUserSession.ts";

type CreateOrderSecureBody = {
  post_ids?: string[];
  delivery_type?: string;
  fio?: string;
  phone?: string;
  city?: string | null;
  cdek_pvz_code?: string | null;
  cdek_pvz_address?: string | null;
  receiver_city_code?: string | null;
  delivery_point?: string | null;
  packaging_type?: string | null;
  address_preset_id?: string | null;
  street?: string | null;
  house?: string | null;
  entrance?: string | null;
  apartment?: string | null;
  floor?: string | null;
  delivery_base_fee_rub?: number | null;
  delivery_markup_rub?: number | null;
  delivery_total_fee_rub?: number | null;
  promo_code?: string | null;
};

function normalizePostIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const supabase = createSupabaseAdminClient();
    const userSession = await requireTelegramUserSession(supabase, req);
    if (!userSession.ok) return userSession.response;

    const body = await req.json().catch(() => null) as CreateOrderSecureBody | null;
    const postIds = normalizePostIds(body?.post_ids);
    const deliveryType = String(body?.delivery_type ?? "").trim();
    const fio = String(body?.fio ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const promoCode = String(body?.promo_code ?? "").trim();

    if (!postIds.length || !deliveryType || !fio || !phone) {
      return json({ ok: false, error: "BAD_PAYLOAD" }, 400);
    }

    let promoSnapshot: Awaited<ReturnType<typeof validatePromoForUserAndSubtotal>> | null = null;
    if (promoCode) {
      try {
        const subtotalWithoutDiscount = await resolveSubtotalByPosts(supabase, postIds);
        promoSnapshot = await validatePromoForUserAndSubtotal({
          supabase,
          tgUserId: userSession.tgUserId,
          promoCode,
          subtotalWithoutDiscountRub: subtotalWithoutDiscount,
        });
      } catch (error) {
        if (error instanceof PromoValidationError) {
          return json({ ok: false, error: error.code }, 200);
        }
        throw error;
      }
    }

    const { data, error } = await supabase.rpc("tg_create_order", {
      p_tg_user_id: userSession.tgUserId,
      p_post_ids: postIds,
      p_delivery_type: deliveryType,
      p_fio: fio,
      p_phone: phone,
      p_city: body?.city ?? null,
      p_cdek_pvz_code: body?.cdek_pvz_code ?? null,
      p_cdek_pvz_address: body?.cdek_pvz_address ?? null,
      p_receiver_city_code: body?.receiver_city_code ?? null,
      p_delivery_point: body?.delivery_point ?? null,
      p_packaging_type: body?.packaging_type ?? "standard",
      p_address_preset_id: body?.address_preset_id ?? null,
      p_street: body?.street ?? null,
      p_house: body?.house ?? null,
      p_entrance: body?.entrance ?? null,
      p_apartment: body?.apartment ?? null,
      p_floor: body?.floor ?? null,
      p_delivery_base_fee_rub: body?.delivery_base_fee_rub ?? null,
      p_delivery_markup_rub: body?.delivery_markup_rub ?? null,
      p_delivery_total_fee_rub: body?.delivery_total_fee_rub ?? null,
      p_promo_id: promoSnapshot?.promo_id ?? null,
      p_promo_code: promoSnapshot?.promo_code ?? null,
      p_promo_type: promoSnapshot?.promo_type ?? null,
      p_promo_discount_percent: promoSnapshot?.promo_discount_percent ?? null,
      p_subtotal_without_discount_rub: promoSnapshot?.subtotal_without_discount_rub ?? null,
      p_promo_discount_amount_rub: promoSnapshot?.promo_discount_amount_rub ?? null,
      p_subtotal_with_discount_rub: promoSnapshot?.subtotal_with_discount_rub ?? null,
      p_final_total_rub: null,
    });

    if (error) {
      return json({ ok: false, error: String(error.message ?? "CREATE_ORDER_FAILED") }, 200);
    }

    const row = Array.isArray(data) ? data[0] : data;
    const orderId = String((row as { order_id?: string | null })?.order_id ?? "").trim();
    const reservedUntil = String((row as { reserved_until?: string | null })?.reserved_until ?? "").trim();
    if (!orderId || !reservedUntil) {
      return json({ ok: false, error: "CREATE_ORDER_FAILED" }, 200);
    }

    return json({
      ok: true,
      order_id: orderId,
      reserved_until: reservedUntil,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
