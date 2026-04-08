import type { TgAddressPreset } from "../api/addressPresetsApi";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripCityPrefix(pvz: string, city: string): string {
  const cityTrimmed = city.trim();
  if (!cityTrimmed) return pvz.trim();

  const cityPattern = escapeRegExp(cityTrimmed);
  const patterns = [
    new RegExp(`^${cityPattern}\\s*,\\s*`, "i"),
    new RegExp(`^\\u0433\\.?\\s*${cityPattern}\\s*,\\s*`, "i"),
    new RegExp(
      `^\\u0433\\u043E\\u0440\\u043E\\u0434\\u0441\\u043A\\u043E\\u0439\\s+\\u043E\\u043A\\u0440\\u0443\\u0433\\s+${cityPattern}\\s*,\\s*`,
      "i",
    ),
    new RegExp(
      `^${cityPattern}\\s*,\\s*\\u0433\\u043E\\u0440\\u043E\\u0434\\u0441\\u043A\\u043E\\u0439\\s+\\u043E\\u043A\\u0440\\u0443\\u0433\\s+${cityPattern}\\s*,\\s*`,
      "i",
    ),
  ];

  let result = pvz.trim();
  for (const pattern of patterns) {
    result = result.replace(pattern, "").trim();
  }

  return result;
}

export function formatCompactAddressHint(address: Pick<TgAddressPreset, "city" | "pvz">): string {
  const city = String(address.city ?? "").trim();
  const pvz = String(address.pvz ?? "").trim();
  if (!pvz) return city;

  const compactPvz = stripCityPrefix(pvz, city);
  return compactPvz || pvz;
}

