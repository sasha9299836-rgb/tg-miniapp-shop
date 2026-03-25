import type { PackagingType } from "../api/ordersApi";

export const PACKAGING_FEES_RUB: Record<PackagingType, number> = {
  standard: 0,
  box: 150,
};

export function getPackagingFeeRub(type: PackagingType | null | undefined): number {
  if (!type) return PACKAGING_FEES_RUB.standard;
  return PACKAGING_FEES_RUB[type] ?? PACKAGING_FEES_RUB.standard;
}

export function formatPackagingLabel(type: PackagingType | null | undefined): string {
  return type === "box" ? "Коробка" : "Обычная упаковка";
}
