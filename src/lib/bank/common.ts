import type { TextItem } from "./pdf";
import { formatCents } from "./money";
import type { ParsedTxn, ValidationCheck } from "./types";

export const PARSER_VERSION = "2026-09-23";

// A PDF that is not a statement we can read; the message is shown to the team.
export class StatementFormatError extends Error {}

export interface Column<K extends string> {
  key: K;
  x0: number;
}

export function check(code: string, ok: boolean, message: string): ValidationCheck {
  return { code, ok, message };
}

export const centerX = (item: TextItem) => (item.x0 + item.x1) / 2;
export const centerY = (item: { top: number; bottom: number }) => (item.top + item.bottom) / 2;

// Columns must be sorted by x0. Header labels sit at the left edge of their column,
// so an item belongs to the last column that starts at or before its centre.
export function columnAt<K extends string>(x: number, cols: Column<K>[]): K | null {
  let found: K | null = null;
  for (const col of cols) if (x >= col.x0) found = col.key;
  return found;
}

export function signedCents(t: Pick<ParsedTxn, "direction" | "amountCents">): number {
  return t.direction === "in" ? t.amountCents : -t.amountCents;
}

export function balanceBreaks(txns: ParsedTxn[], openingCents: number): string[] {
  const breaks: string[] = [];
  let balance = openingCents;
  for (const t of txns) {
    balance += signedCents(t);
    if (balance !== t.balanceCents) {
      breaks.push(`${t.postedOn} RM${formatCents(t.amountCents)}: expected ${formatCents(balance)}, statement shows ${formatCents(t.balanceCents)}`);
      balance = t.balanceCents;
    }
  }
  return breaks;
}

export function summarise(list: string[], max = 3): string {
  return list.slice(0, max).join("; ") + (list.length > max ? ` (+${list.length - max} more)` : "");
}

export function datesOutside(txns: ParsedTxn[], start: string, end: string): ParsedTxn[] {
  return txns.filter((t) => t.postedOn < start || t.postedOn > end);
}
