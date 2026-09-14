// Bank-agnostic shape produced by the statement parsers. Money is integer cents.

export type BankCode = "UOB" | "PBB";
export type TxnDirection = "in" | "out";

export interface ParsedTxn {
  seq: number;
  page: number;
  postedOn: string; // ISO date the bank posted it (statement date)
  txnDate: string; // ISO date the payment was made (UOB transaction date, else postedOn)
  txnAt: string | null; // ISO timestamp in MYT (+08:00), UOB only
  direction: TxnDirection;
  amountCents: number; // >= 0
  balanceCents: number;
  descLines: string[];
  description: string;
  txnType: string | null;
  reference: string | null;
  counterparty: string | null;
}

export const TXN_CATEGORY_KEYS = [
  "advertising",
  "event_costs",
  "contractors",
  "salary",
  "staff_claim",
  "rental",
  "software",
  "purchases",
  "transport",
  "meals",
  "professional_fees",
  "tax_statutory",
  "bank_charges",
  "refund",
  "loan_advance",
  "own_transfer",
  "other",
  "customer_payment",
  "other_income",
] as const;
export type TxnCategory = (typeof TXN_CATEGORY_KEYS)[number];

// One transaction as sent to the import_bank_statement RPC (snake_case = database columns).
export interface ImportRow {
  seq: number;
  page: number;
  posted_on: string;
  txn_date: string;
  txn_at: string | null;
  direction: TxnDirection;
  amount: string;
  balance: string;
  description: string;
  desc_lines: string[];
  txn_type: string | null;
  reference: string | null;
  counterparty: string | null;
  fingerprint: string;
  category: TxnCategory | null;
}

export interface ValidationCheck {
  code: string;
  ok: boolean;
  message: string;
}

export interface ParsedStatement {
  bank: BankCode;
  accountNo: string;
  accountName: string | null;
  periodStart: string;
  periodEnd: string;
  openingCents: number;
  closingCents: number;
  totalInCents: number;
  totalOutCents: number;
  declaredCount: number | null;
  declaredInCents: number | null;
  declaredOutCents: number | null;
  segmentation: "rulings" | "text-fallback" | "n/a";
  transactions: ParsedTxn[];
  checks: ValidationCheck[];
  warnings: string[];
  ok: boolean;
  parserVersion: string;
}
