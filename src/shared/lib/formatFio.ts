export function normalizeFio(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .trimStart()
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ""))
    .join(" ");
}
