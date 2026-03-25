export const RU_PHONE_NATIONAL_LENGTH = 10;

export function extractNationalDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  let normalized = digits;
  if (normalized.startsWith("8")) normalized = normalized.slice(1);
  else if (normalized.startsWith("7")) normalized = normalized.slice(1);

  return normalized.slice(0, RU_PHONE_NATIONAL_LENGTH);
}

export function formatRussianPhoneFromNationalDigits(nationalDigits: string): string {
  const digits = extractNationalDigits(nationalDigits);
  if (!digits) return "";

  const a = digits.slice(0, 3);
  const b = digits.slice(3, 6);
  const c = digits.slice(6, 8);
  const d = digits.slice(8, 10);

  let out = "+7";
  if (a) out += `(${a}`;
  if (a.length === 3) out += ")";
  if (b) out += ` ${b}`;
  if (c) out += `-${c}`;
  if (d) out += `-${d}`;
  return out;
}

export function formatRussianPhone(input: string): string {
  return formatRussianPhoneFromNationalDigits(extractNationalDigits(input));
}

export function countNationalDigitsBeforeCursor(value: string, cursor: number): number {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  return extractNationalDigits(value.slice(0, safeCursor)).length;
}

export function cursorPosByNationalDigits(formatted: string, nationalDigitsCount: number): number {
  const target = Math.max(0, Math.min(nationalDigitsCount, RU_PHONE_NATIONAL_LENGTH));
  if (target === 0) {
    return formatted.startsWith("+7(") ? 3 : formatted.length;
  }

  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (!/\d/.test(formatted[i])) continue;
    if (i === 1 && formatted.startsWith("+7")) continue;
    seen += 1;
    if (seen >= target) return i + 1;
  }

  return formatted.length;
}
