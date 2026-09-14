// Money and date helpers for bank statement parsing. Amounts are kept as
// integer cents so running balances never drift.

export const MONEY_RE = /^-?[\d,]*\d\.\d{2}$/;
export const DMY_RE = /^\d{2}\/\d{2}\/\d{4}$/;

export function parseMoney(s: string): number {
  const clean = s.replace(/,/g, "").trim();
  if (!MONEY_RE.test(s.trim())) throw new Error(`Not an amount: "${s}"`);
  const negative = clean.startsWith("-");
  const [whole, frac] = clean.replace("-", "").split(".");
  const cents = parseInt(whole || "0", 10) * 100 + parseInt(frac, 10);
  return negative ? -cents : cents;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

export function centsToNumber(cents: number): number {
  return cents / 100;
}

// Exact decimal string for numeric database columns: 123456 -> "1234.56"
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// "04/05/2026" -> "2026-05-04"
export function dmyToIso(dmy: string): string {
  const m = dmy.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error(`Not a dd/mm/yyyy date: "${dmy}"`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// "01:09:48" + "PM" -> "13:09:48"
export function to24h(hms: string, meridiem: string | null): string {
  const [h, m, s] = hms.split(":").map((n) => parseInt(n, 10));
  let hour = h;
  if (meridiem) {
    const pm = meridiem.toUpperCase() === "PM";
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }
  return `${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s ?? 0).padStart(2, "0")}`;
}

// Uppercase letters and digits only: used for name and keyword matching.
export function compact(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
