import type { BankAccount, BankTransactionRow, ExpenseDoneReason, ExpenseStatus, ReceivedStatus, TxnCategory } from "@/lib/types";

type StatusInput = Pick<BankTransactionRow, "direction" | "amount" | "category" | "doc_count" | "explanation" | "linked_total">;

// Money received that is not an invoice payment, so it needs no invoice.
export const NO_INVOICE_CATEGORIES: TxnCategory[] = ["own_transfer", "loan_advance", "refund", "product_sales", "other_income"];

// Mirrors the status column of bank_transactions_view so edits show straight away.
export function expenseStatus(t: StatusInput): { status: ExpenseStatus | ReceivedStatus | null; done_reason: ExpenseDoneReason | null } {
  const explained = Boolean(t.explanation?.trim());
  if (t.direction === "in") {
    const linked = Number(t.linked_total ?? 0);
    const amount = Number(t.amount);
    if (linked > 0 && (linked >= amount - 0.005 || explained)) return { status: "matched", done_reason: null };
    if (linked > 0) return { status: "partial", done_reason: null };
    if (amount === 0 || explained || (t.category && NO_INVOICE_CATEGORIES.includes(t.category))) return { status: "no_invoice", done_reason: null };
    return { status: "unmatched", done_reason: null };
  }
  if (t.doc_count > 0) return { status: "done", done_reason: "documents" };
  if (explained) return { status: "done", done_reason: "explanation" };
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
