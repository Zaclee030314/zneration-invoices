import { formatRM } from "@/lib/company";

// "RM 230,000.00"; other currencies fall back to their ISO code.
export function formatMoney(amount: number | null | undefined, currency = "MYR"): string {
  if (amount == null) return "";
  const symbol = currency === "MYR" ? "RM" : currency;
  return `${symbol} ${formatRM(Number(amount))}`;
}
