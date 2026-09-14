import type { ParsedTxn } from "./types";

// Identifies a transaction within one bank account independent of which statement
// it came from, so overlapping or re-uploaded statements never create duplicates.
// The running balance separates identical same-day payments; the occurrence number
// covers the rare case where even that repeats.
export function assignFingerprints(txns: Pick<ParsedTxn, "postedOn" | "direction" | "amountCents" | "balanceCents">[]): string[] {
  const seen = new Map<string, number>();
  return txns.map((t) => {
    const base = `${t.postedOn}|${t.direction}|${t.amountCents}|${t.balanceCents}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return `${base}|${occurrence}`;
  });
}
