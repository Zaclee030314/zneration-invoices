import type { BankAccount, BankTransactionRow, ExpenseDoneReason, ExpenseStatus } from "@/lib/types";

type StatusInput = Pick<BankTransactionRow, "direction" | "amount" | "category" | "doc_count" | "explanation">;

// Mirrors the status column of bank_transactions_view so edits show straight away.
export function expenseStatus(t: StatusInput): { status: ExpenseStatus | null; done_reason: ExpenseDoneReason | null } {
  if (t.direction !== "out") return { status: null, done_reason: null };
  if (t.doc_count > 0) return { status: "done", done_reason: "documents" };
  if (t.explanation?.trim()) return { status: "done", done_reason: "explanation" };
  if (t.category === "own_transfer") return { status: "done", done_reason: "own_transfer" };
  if (Number(t.amount) === 0) return { status: "done", done_reason: "zero_amount" };
  return { status: "needs_attention", done_reason: null };
}

export const DONE_REASON_LABEL: Record<ExpenseDoneReason, string> = {
  documents: "Backed by documents",
  explanation: "Explained",
  own_transfer: "Transfer between the company's own accounts",
  zero_amount: "Zero amount",
};

export function payeeLabel(t: Pick<BankTransactionRow, "counterparty" | "reference" | "txn_type">): string {
  return t.counterparty || t.reference || t.txn_type || "Bank transaction";
}

// Same fallback as account_label in bank_transactions_view.
export function accountLabel(a: Pick<BankAccount, "bank" | "account_no" | "label">): string {
  return a.label?.trim() || `${a.bank} ${a.account_no.slice(-4)}`;
}
