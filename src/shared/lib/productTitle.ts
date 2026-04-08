export function getProductDisplayTitle(input: { title?: string | null; brand?: string | null }): string {
  const title = String(input.title ?? "").trim();
  const brand = String(input.brand ?? "").trim();
  if (!brand) return title;
  if (!title) return brand;
  if (title.toLowerCase().includes(brand.toLowerCase())) return title;
  return `${title} ${brand}`.trim();
}

