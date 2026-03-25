import type { ShippingRepository, City, PickupPoint } from "./shipping.repository";
import { shippingApiClient } from "./shippingApiClient";
import { getCdekProxyBaseUrl } from "./cdekProxyBase";

const BASE = getCdekProxyBaseUrl();

function buildApiUrl(path: string) {
  return BASE ? `${BASE}${path}` : path;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
  });
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Expected JSON but got ${contentType || "unknown"}. First 120 chars: ${text.slice(0, 120)}`);
  }

  if (!text.trim()) {
    console.error("cdek proxy empty response", { url, status: res.status });
    throw new Error("Empty response body");
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("cdek proxy invalid json", { url, status: res.status, preview: text.slice(0, 300) });
    throw new Error("Invalid JSON response");
  }

  if (!res.ok) {
    const message =
      typeof data === "object" && data?.error
        ? String(data.error)
        : `Request failed (${res.status})`;

    const details =
      typeof data === "object" && data?.details
        ? JSON.stringify(data.details)
        : "";

    throw new Error(details ? `${message}: ${details}` : message);
  }

  return data as T;
}

export const shippingRepository: ShippingRepository = {
  async searchCities(q: string): Promise<City[]> {
    const url = buildApiUrl(`/api/cdek/cities?q=${encodeURIComponent(q)}&t=${Date.now()}`);
    return await getJson<City[]>(url);
  },

  async getPickupPoints(cityCode: number | string): Promise<PickupPoint[]> {
    const url = buildApiUrl(`/api/cdek/pvz?cityCode=${encodeURIComponent(String(cityCode))}&t=${Date.now()}`);
    return await getJson<PickupPoint[]>(url);
  },

  async calcDelivery(params) {
    const raw = await shippingApiClient.quote({
      originProfile: params.originProfile,
      packagingPreset: params.packagingPreset,
      receiverCityCode: params.cityCode,
      package: {
        weight: Math.max(100, Math.floor(params.weightGrams)),
        length: Math.max(1, Math.floor(params.lengthCm ?? 15)),
        width: Math.max(1, Math.floor(params.widthCm ?? 10)),
        height: Math.max(1, Math.floor(params.heightCm ?? 4)),
      },
    });

    const list: any[] = Array.isArray(raw?.availableTariffs)
      ? raw.availableTariffs
      : Array.isArray((raw?.availableTariffs as any)?.tariffs)
        ? (raw.availableTariffs as any).tariffs
        : raw?.selectedTariff
          ? [raw.selectedTariff]
          : [];

    return list
      .map((t) => ({
        tariffName: t.tariff_name ?? t.name ?? "Tariff",
        price: t.delivery_sum ?? t.total_sum ?? t.price ?? t.cost ?? t.services_cost ?? 0,
        periodMinDays: t.period_min ?? t.delivery_period_min ?? t.min_delivery_days,
        periodMaxDays: t.period_max ?? t.delivery_period_max ?? t.max_delivery_days,
      }))
      .filter((t) => Number.isFinite(t.price) && t.price > 0);
  },
};

export const cdekProxyShippingRepository = shippingRepository;
