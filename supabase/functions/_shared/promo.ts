export type PromoType = "single_use" | "multi_use";
export type PromoStoredStatus = "active" | "disabled" | "exhausted";
export type PromoEffectiveStatus = PromoStoredStatus | "expired";

export type PromoSnapshot = {
  promo_id: string;
  promo_code: string;
  promo_type: PromoType;
  promo_discount_percent: number;
  subtotal_without_discount_rub: number;
  promo_discount_amount_rub: number;
  subtotal_with_discount_rub: number;
};

type PromoRow = {
  id: string;
  code: string;
  type: PromoType;
  discount_percent: number;
  status: PromoStoredStatus;
  active_from: string | null;
  active_to: string | null;
  expires_at: string | null;
  deleted_at: string | null;
};

type PostRow = {
  id: string;
  price: number | null;
  status: string | null;
  sale_status: string | null;
};

export class PromoValidationError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "PromoValidationError";
    this.code = code;
  }
}

function normalizePromoCode(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export function resolvePromoEffectiveStatus(row: PromoRow): PromoEffectiveStatus {
  if (row.status !== "active") return row.status;
  const effectiveActiveTo = row.active_to ?? row.expires_at;
  if (!effectiveActiveTo) return "active";
  const expiresAtMs = new Date(effectiveActiveTo).getTime();
  if (!Number.isFinite(expiresAtMs)) return "active";
  return expiresAtMs <= Date.now() ? "expired" : "active";
}

export async function resolveSubtotalByPosts(
  supabase: any,
  postIds: string[],
): Promise<number> {
  const normalizedPostIds = postIds
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (!normalizedPostIds.length) {
    throw new PromoValidationError("PROMO_POST_IDS_REQUIRED");
  }

  const uniquePostIds = [...new Set(normalizedPostIds)];
  const { data, error } = await supabase
    .from("tg_posts")
    .select("id, price, status, sale_status")
    .in("id", uniquePostIds);
  if (error) {
    throw new PromoValidationError("PROMO_POST_LOOKUP_FAILED", error.message);
  }

  const rows = (data ?? []) as PostRow[];
  if (rows.length !== uniquePostIds.length) {
    throw new PromoValidationError("PROMO_POST_NOT_FOUND");
  }

  const byId = new Map<string, PostRow>();
  for (const row of rows) {
    byId.set(String(row.id), row);
  }

  let subtotal = 0;
  for (const postId of normalizedPostIds) {
    const row = byId.get(postId);
    if (!row) throw new PromoValidationError("PROMO_POST_NOT_FOUND");
    if (String(row.status ?? "").trim() !== "published") {
      throw new PromoValidationError("PROMO_POST_NOT_PUBLISHED");
    }
    if (String(row.sale_status ?? "").trim() !== "available") {
      throw new PromoValidationError("PROMO_POST_NOT_AVAILABLE");
    }
    subtotal += Math.max(0, Number(row.price ?? 0));
  }

  return subtotal;
}

export async function validatePromoForUserAndSubtotal(input: {
  supabase: any;
  tgUserId: number;
  promoCode: string;
  subtotalWithoutDiscountRub: number;
}): Promise<PromoSnapshot> {
  const promoCode = normalizePromoCode(input.promoCode);
  if (!promoCode) throw new PromoValidationError("PROMO_CODE_REQUIRED");
  const subtotalWithoutDiscountRub = Math.max(0, Math.round(Number(input.subtotalWithoutDiscountRub ?? 0)));
  if (!Number.isFinite(subtotalWithoutDiscountRub) || subtotalWithoutDiscountRub <= 0) {
    throw new PromoValidationError("PROMO_SUBTOTAL_INVALID");
  }

  const { data, error } = await input.supabase
    .from("tg_promo_codes")
    .select("id, code, type, discount_percent, status, active_from, active_to, expires_at, deleted_at")
    .ilike("code", promoCode)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new PromoValidationError("PROMO_LOOKUP_FAILED", error.message);
  }
  if (!data) {
    throw new PromoValidationError("PROMO_NOT_FOUND");
  }

  const promo = data as PromoRow;
  const effectiveStatus = resolvePromoEffectiveStatus(promo);
  if (effectiveStatus === "disabled") throw new PromoValidationError("PROMO_DISABLED");
  if (effectiveStatus === "exhausted") throw new PromoValidationError("PROMO_EXHAUSTED");
  if (effectiveStatus === "expired") throw new PromoValidationError("PROMO_EXPIRED");

  const nowMs = Date.now();
  const activeFromMs = promo.active_from ? new Date(promo.active_from).getTime() : Number.NaN;
  if (Number.isFinite(activeFromMs) && activeFromMs > nowMs) {
    throw new PromoValidationError("PROMO_NOT_STARTED");
  }

  const activeToRaw = promo.active_to ?? promo.expires_at;
  const activeToMs = activeToRaw ? new Date(activeToRaw).getTime() : Number.NaN;
  if (Number.isFinite(activeToMs) && activeToMs <= nowMs) {
    throw new PromoValidationError("PROMO_EXPIRED");
  }

  if (promo.type !== "single_use" && promo.type !== "multi_use") {
    throw new PromoValidationError("PROMO_TYPE_INVALID");
  }

  const discountPercent = Math.round(Number(promo.discount_percent ?? 0));
  if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 95) {
    throw new PromoValidationError("PROMO_PERCENT_INVALID");
  }

  if (promo.type === "single_use") {
    const { data: usageRows, error: usageError } = await input.supabase
      .from("tg_promo_usages")
      .select("id")
      .eq("promo_id", promo.id)
      .eq("tg_user_id", input.tgUserId)
      .eq("is_final", true)
      .limit(1);
    if (usageError) {
      throw new PromoValidationError("PROMO_USAGE_LOOKUP_FAILED", usageError.message);
    }
    if ((usageRows ?? []).length > 0) {
      throw new PromoValidationError("PROMO_ALREADY_USED_BY_USER");
    }
  }

  const discountAmount = Math.floor((subtotalWithoutDiscountRub * discountPercent) / 100);
  const subtotalWithDiscount = Math.max(0, subtotalWithoutDiscountRub - discountAmount);

  return {
    promo_id: promo.id,
    promo_code: promo.code,
    promo_type: promo.type,
    promo_discount_percent: discountPercent,
    subtotal_without_discount_rub: subtotalWithoutDiscountRub,
    promo_discount_amount_rub: discountAmount,
    subtotal_with_discount_rub: subtotalWithDiscount,
  };
}
