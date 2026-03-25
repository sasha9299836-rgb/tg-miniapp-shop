import { getCdekProxyBaseUrl } from "./cdekProxyBase";

const BASE = getCdekProxyBaseUrl();

function buildUrl(path: string) {
  return `${BASE}${path}`;
}

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

type ApiErrorShape = {
  error?: string;
  message?: string;
  details?: unknown;
};

async function requestJson<T>(path: string, options?: RequestOptions): Promise<T> {
  const url = buildUrl(path);
  const { body: payload, headers, ...rest } = options ?? {};
  const method = String(rest.method ?? "GET").toUpperCase();
  const body =
    method === "GET" || method === "HEAD"
      ? undefined
      : payload == null
        ? undefined
        : typeof payload === "string"
          ? payload
          : JSON.stringify(payload);

  const res = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body,
  });

  const text = await res.text().catch(() => "");
  let data: ApiErrorShape | unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message =
      typeof data === "object" && data
        ? (data as ApiErrorShape).error ??
          (data as ApiErrorShape).message ??
          `Request failed (${res.status})`
        : `Request failed (${res.status})`;
    throw new Error(String(message));
  }

  return data as T;
}

export type ShippingOriginProfile = "ODN" | "YAN";
export type ShippingPackagingPreset = "A2" | "A3" | "A4";

export type ShippingPackageInput = {
  weight: number;
  length: number;
  width: number;
  height: number;
};

export type ShippingQuotePayload = {
  originProfile?: ShippingOriginProfile;
  packagingPreset?: ShippingPackagingPreset;
  receiverCityCode: number | string;
  package: ShippingPackageInput;
};

export type ShippingQuoteResponse = {
  ok: boolean;
  originProfile: ShippingOriginProfile;
  shipmentPoint: string;
  selectedTariffCode: number;
  selectedTariff: Record<string, unknown> | null;
  availableTariffs: unknown;
  payloadUsed?: unknown;
};

export const shippingApiClient = {
  quote(payload: ShippingQuotePayload, debug = false) {
    const suffix = debug ? "?debug=1" : "";
    return requestJson<ShippingQuoteResponse>(`/api/shipping/quote${suffix}`, {
      method: "POST",
      body: payload,
    });
  },
};

export default shippingApiClient;
