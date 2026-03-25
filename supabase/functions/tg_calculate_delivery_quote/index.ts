import { createSupabaseAdminClient, empty, getRequiredSecret, json } from "../_shared/admin.ts";

type OriginProfile = "ODN" | "YAN";
type PackagingPreset = "A2" | "A3" | "A4";
type OriginBreakdown = {
  origin_profile: OriginProfile;
  packaging_preset: PackagingPreset;
  selected_tariff_code: number | null;
  delivery_base_fee_rub: number;
  package_fee_rub: number;
  delivery_total_fee_rub: number;
  package: {
    weight: number;
    length: number;
    width: number;
    height: number;
  };
};

type QuoteRequestBody = {
  post_ids?: string[];
  receiver_city_code?: string;
  delivery_point?: string;
};

const DELIVERY_MARKUP_RUB = 60;
const A2_PACKAGE_FEE_RUB = 80;

const PACKAGE_PRESET_DIMENSIONS: Record<PackagingPreset, { weight: number; length: number; width: number; height: number }> = {
  A4: { weight: 400, length: 15, width: 10, height: 4 },
  A3: { weight: 600, length: 35, width: 42, height: 4 },
  A2: { weight: 900, length: 49, width: 58, height: 7 },
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function isOriginProfile(value: unknown): value is OriginProfile {
  return value === "ODN" || value === "YAN";
}

function isPackagingPreset(value: unknown): value is PackagingPreset {
  return value === "A2" || value === "A3" || value === "A4";
}

function normalizePostIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
}

function resolveCartPackaging(packagingPresets: PackagingPreset[]): PackagingPreset {
  if (!packagingPresets.length) {
    throw new Error("POST_IDS_REQUIRED");
  }

  if (packagingPresets.length >= 3) {
    return "A2";
  }

  if (packagingPresets.length === 1) {
    return packagingPresets[0];
  }

  const first = packagingPresets[0];
  const second = packagingPresets[1];

  if (first === "A2" || second === "A2") return "A2";
  if (first === "A3" && second === "A3") return "A2";
  if ((first === "A4" && second === "A3") || (first === "A3" && second === "A4")) return "A2";
  return "A3"; // A4 + A4
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function pickDeliveryBaseFeeRub(payload: Record<string, unknown> | null): number | null {
  if (!payload) return null;

  const selectedTariff =
    payload.selectedTariff && typeof payload.selectedTariff === "object"
      ? payload.selectedTariff as Record<string, unknown>
      : null;

  const directCandidates = [
    payload.delivery_base_fee_rub,
    payload.deliveryBaseFeeRub,
    payload.delivery_sum,
    payload.total_sum,
    payload.price,
    payload.cost,
  ];

  const selectedCandidates = selectedTariff
    ? [
      selectedTariff.delivery_sum,
      selectedTariff.total_sum,
      selectedTariff.price,
      selectedTariff.cost,
      selectedTariff.services_cost,
    ]
    : [];

  const availableTariffs = Array.isArray(payload.availableTariffs)
    ? payload.availableTariffs as unknown[]
    : null;
  const firstTariff = availableTariffs?.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  const firstTariffCandidates = firstTariff
    ? [
      firstTariff.delivery_sum,
      firstTariff.total_sum,
      firstTariff.price,
      firstTariff.cost,
      firstTariff.services_cost,
    ]
    : [];

  const candidates = [...directCandidates, ...selectedCandidates, ...firstTariffCandidates];

  for (const candidate of candidates) {
    const parsed = toNumber(candidate);
    if (parsed != null && parsed >= 0) {
      return Math.round(parsed);
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(200);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = await req.json().catch(() => null) as QuoteRequestBody | null;
    const postIds = normalizePostIds(body?.post_ids);
    const receiverCityCode = normalizeText(body?.receiver_city_code);
    const deliveryPoint = normalizeText(body?.delivery_point);

    if (!postIds.length) return json({ error: "POST_IDS_REQUIRED" }, 400);
    if (!receiverCityCode) return json({ error: "RECEIVER_CITY_CODE_REQUIRED" }, 400);
    if (!deliveryPoint) return json({ error: "DELIVERY_POINT_REQUIRED" }, 400);

    const uniquePostIds = [...new Set(postIds)];

    const supabase = createSupabaseAdminClient();
    const { data: posts, error: postError } = await supabase
      .from("tg_posts")
      .select("id, status, origin_profile, packaging_preset")
      .in("id", uniquePostIds);

    if (postError) {
      return json({ error: "POST_LOOKUP_FAILED", details: postError.message }, 500);
    }
    const foundPosts = (posts ?? []) as Array<Record<string, unknown>>;
    if (!foundPosts.length || foundPosts.length !== uniquePostIds.length) {
      return json({ error: "POST_NOT_FOUND" }, 404);
    }

    const postsById = new Map<string, Record<string, unknown>>();
    for (const post of foundPosts) {
      postsById.set(normalizeText(post.id), post);
    }
    const orderedPosts = postIds.map((id) => postsById.get(id)).filter(Boolean) as Array<Record<string, unknown>>;

    for (const post of orderedPosts) {
      const postStatus = normalizeText(post.status);
      if (postStatus !== "published") {
        return json({ error: "POST_NOT_PUBLISHED" }, 409);
      }
    }

    const groupedPackagingPresets = new Map<OriginProfile, PackagingPreset[]>();
    for (const post of orderedPosts) {
      const originProfileRaw = normalizeText(post.origin_profile);
      if (!isOriginProfile(originProfileRaw)) {
        return json({ error: "POST_ORIGIN_PROFILE_REQUIRED" }, 409);
      }
      const packagingPresetRaw = normalizeText(post.packaging_preset);
      if (!isPackagingPreset(packagingPresetRaw)) {
        return json({ error: "POST_PACKAGING_PRESET_REQUIRED" }, 409);
      }
      const current = groupedPackagingPresets.get(originProfileRaw) ?? [];
      current.push(packagingPresetRaw);
      groupedPackagingPresets.set(originProfileRaw, current);
    }

    const originGroups = [...groupedPackagingPresets.entries()]
      .map(([originProfile, presets]) => ({ originProfile, presets }))
      .sort((left, right) => left.originProfile.localeCompare(right.originProfile));
    if (!originGroups.length) {
      return json({ error: "POST_ORIGIN_PROFILE_REQUIRED" }, 409);
    }

    const proxyBase = getRequiredSecret("CDEK_PROXY_BASE_URL").replace(/\/+$/, "");
    const quoteUrl = `${proxyBase}/api/shipping/quote`;
    const breakdown: OriginBreakdown[] = [];

    for (const group of originGroups) {
      const packagingPresetResolved = resolveCartPackaging(group.presets);
      const packageSnapshot = PACKAGE_PRESET_DIMENSIONS[packagingPresetResolved];

      const proxyResponse = await fetch(quoteUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          originProfile: group.originProfile,
          packagingPreset: packagingPresetResolved,
          receiverCityCode,
          package: packageSnapshot,
        }),
      });

      const proxyJson = await proxyResponse.json().catch(() => null) as Record<string, unknown> | null;
      if (!proxyResponse.ok || !proxyJson?.ok) {
        return json({
          error: "DELIVERY_QUOTE_UPSTREAM_FAILED",
          details: {
            origin_profile: group.originProfile,
            status: proxyResponse.status,
            upstreamError: typeof proxyJson?.error === "string" ? proxyJson.error : null,
            upstreamMessage: typeof proxyJson?.message === "string" ? proxyJson.message : null,
          },
        }, 502);
      }

      const deliveryBaseFeeRub = pickDeliveryBaseFeeRub(proxyJson);
      if (deliveryBaseFeeRub == null) {
        return json({ error: "DELIVERY_QUOTE_PRICE_MISSING", details: { origin_profile: group.originProfile } }, 502);
      }

      const packageFeeRub = packagingPresetResolved === "A2" ? A2_PACKAGE_FEE_RUB : 0;
      breakdown.push({
        origin_profile: group.originProfile,
        packaging_preset: packagingPresetResolved,
        selected_tariff_code: Number(proxyJson.selectedTariffCode ?? 0) || null,
        delivery_base_fee_rub: deliveryBaseFeeRub,
        package_fee_rub: packageFeeRub,
        delivery_total_fee_rub: deliveryBaseFeeRub + packageFeeRub,
        package: packageSnapshot,
      });
    }

    const isMultiOrigin = breakdown.length > 1;
    const deliveryBaseFeeRub = breakdown.reduce((sum, item) => sum + item.delivery_base_fee_rub, 0);
    const packageFeeRub = breakdown.reduce((sum, item) => sum + item.package_fee_rub, 0);
    const deliveryMarkupRub = isMultiOrigin ? 0 : DELIVERY_MARKUP_RUB;
    const deliveryTotalFeeRub = deliveryBaseFeeRub + deliveryMarkupRub + packageFeeRub;
    const firstGroup = breakdown[0];

    return json({
      ok: true,
      post_ids: postIds,
      originProfileUsed: firstGroup.origin_profile,
      packagingPresetUsed: firstGroup.packaging_preset,
      selectedTariffCode: firstGroup.selected_tariff_code,
      delivery_base_fee_rub: deliveryBaseFeeRub,
      delivery_markup_rub: deliveryMarkupRub,
      package_fee_rub: packageFeeRub,
      delivery_total_fee_rub: deliveryTotalFeeRub,
      package: firstGroup.package,
      breakdown,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return json({ error: "SERVER_ERROR", details: message }, 500);
  }
});
