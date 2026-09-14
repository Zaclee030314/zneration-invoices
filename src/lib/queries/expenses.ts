// Data access for Expenses: imported bank transactions, the documents that back
// them, and the statements they came from. Views are security_invoker, so they
// are queried like tables.
import { supabase } from "@/lib/supabase/client";
import { apiJson } from "@/lib/api";
import { removeAttachments, uploadAttachment } from "@/lib/attachments";
import { ATTACHMENTS_BUCKET, MAX_ATTACHMENT_BYTES, attachmentPath } from "@/lib/attachment-rules";
import type {
  BankAccount, BankStatement, BankTag, BankTransaction, BankTransactionRow, ExpenseDocKind, ExpenseDocument,
  StatementImportResult, StatementPreview, TxnCategory,
} from "@/lib/types";

type Result<T> = { data: T; error: null } | { data: null; error: string };

function ok<T>(data: T): Result<T> {
  return { data, error: null };
}
function fail<T>(message: string): Result<T> {
  return { data: null, error: message };
}

// PostgREST returns at most 1000 rows per request.
const PAGE = 1000;

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
export async function fetchTransactions(range: { from: string; to: string }, direction: "in" | "out" = "out"): Promise<Result<BankTransactionRow[]>> {
  const rows: BankTransactionRow[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("bank_transactions_view")
      .select("*")
      .eq("direction", direction)
      .gte("txn_date", range.from)
      .lte("txn_date", range.to)
      .order("txn_date", { ascending: false })
      .order("id")
      .range(start, start + PAGE - 1);
    if (error) return fail(error.message);
    rows.push(...((data ?? []) as BankTransactionRow[]));
    if (!data || data.length < PAGE) break;
  }
  return ok(rows);
}

export type TransactionPatch = Partial<Pick<BankTransaction, "category" | "category_source" | "project_id" | "tag" | "explanation">>;

export async function updateTransactions(ids: string[], patch: TransactionPatch): Promise<Result<true>> {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from("bank_transactions").update(patch).in("id", ids.slice(i, i + 100));
    if (error) return fail(error.message);
  }
  return ok(true);
}

// Other payments to the same payee whose category nobody has chosen yet.
export async function findCounterpartyMatches(
  t: Pick<BankTransactionRow, "counterparty_key" | "direction">,
  category: TxnCategory,
  excludeIds: string[]
): Promise<Result<string[]>> {
  if (!t.counterparty_key) return ok([]);
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("id, category, category_source")
    .eq("counterparty_key", t.counterparty_key)
    .eq("direction", t.direction)
    .limit(PAGE);
  if (error) return fail(error.message);
  const skip = new Set(excludeIds);
  return ok(
    (data ?? [])
      .filter((r) => !skip.has(r.id as string) && r.category_source !== "user" && r.category !== category && r.category !== "own_transfer")
      .map((r) => r.id as string)
  );
}

export async function fetchTags(): Promise<Result<BankTag[]>> {
  const { data, error } = await supabase.from("bank_tags").select("*").order("last_used_at", { ascending: false }).limit(300);
  if (error) return fail(error.message);
  return ok((data as BankTag[]) ?? []);
}

// ---------------------------------------------------------------------------
// Accounts and statements
// ---------------------------------------------------------------------------
export async function fetchAccounts(): Promise<Result<BankAccount[]>> {
  const { data, error } = await supabase.from("bank_accounts").select("*").order("bank").order("account_no");
  if (error) return fail(error.message);
  return ok((data as BankAccount[]) ?? []);
}

export async function updateAccountLabel(id: string, label: string | null): Promise<Result<true>> {
  const { error } = await supabase.from("bank_accounts").update({ label }).eq("id", id);
  if (error) return fail(error.message);
  return ok(true);
}

export async function fetchStatements(): Promise<Result<BankStatement[]>> {
  const { data, error } = await supabase.from("bank_statements").select("*").order("period_start", { ascending: false }).limit(PAGE);
  if (error) return fail(error.message);
  return ok((data as BankStatement[]) ?? []);
}

export async function fetchStatementPath(id: string): Promise<Result<string>> {
  const { data, error } = await supabase.from("bank_statements").select("file_path").eq("id", id).single();
  if (error || !data) return fail(error?.message ?? "Statement not found.");
  return ok(data.file_path as string);
}

// Transactions per account per month ("{account_id}|YYYY-MM" -> count) for the statements grid.
export async function fetchMonthlyCounts(year: number): Promise<Result<Record<string, number>>> {
  const counts: Record<string, number> = {};
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("bank_transactions")
      .select("id, account_id, posted_on")
      .gte("posted_on", `${year}-01-01`)
      .lte("posted_on", `${year}-12-31`)
      .order("id")
      .range(start, start + PAGE - 1);
    if (error) return fail(error.message);
    for (const r of data ?? []) {
      const key = `${r.account_id}|${String(r.posted_on).slice(0, 7)}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    if (!data || data.length < PAGE) break;
  }
  return ok(counts);
}

export async function deleteStatement(id: string): Promise<Result<{ deleted: number; kept: number }>> {
  const { data, error } = await supabase.rpc("delete_bank_statement", { p_statement: id });
  if (error) return fail(error.message);
  const res = data as { file_path: string | null; deleted: number; kept: number };
  if (res.file_path) await removeAttachments([res.file_path]);
  return ok({ deleted: res.deleted, kept: res.kept });
}

export async function uploadStatementPdf(workspaceId: string, file: File): Promise<Result<{ statementId: string; path: string }>> {
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return fail("Only PDF bank statements can be imported.");
  if (file.size > MAX_ATTACHMENT_BYTES) return fail("That file is larger than 10 MB.");
  const statementId = crypto.randomUUID();
  const name = /\.pdf$/i.test(file.name) ? file.name : `${file.name}.pdf`;
  const path = attachmentPath(workspaceId, "statements", statementId, name);
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
  if (error) return fail(error.message);
  return ok({ statementId, path });
}

type StatementRequest = { statementId: string; path: string; fileName: string };

export async function previewStatement(input: StatementRequest): Promise<Result<StatementPreview>> {
  try {
    const res = await apiJson<{ preview: StatementPreview }>("/api/expenses/statements", { mode: "preview", ...input });
    return ok(res.preview);
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function importStatement(input: StatementRequest): Promise<Result<StatementImportResult>> {
  try {
    const res = await apiJson<{ result: StatementImportResult }>("/api/expenses/statements", { mode: "import", ...input });
    return ok(res.result);
  } catch (e) {
    return fail((e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export async function fetchDocuments(transactionId: string): Promise<Result<ExpenseDocument[]>> {
  const { data, error } = await supabase
    .from("expense_documents")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("created_at");
  if (error) return fail(error.message);
  return ok((data as ExpenseDocument[]) ?? []);
}

export async function uploadExpenseDocument(
  txn: Pick<BankTransaction, "id" | "workspace_id">,
  file: File,
  kind: ExpenseDocKind
): Promise<Result<ExpenseDocument>> {
  return uploadAttachment({
    workspaceId: txn.workspace_id,
    area: "expenses",
    recordId: txn.id,
    file,
    link: async (path, contentType) => {
      const { data, error } = await supabase
        .from("expense_documents")
        .insert({
          workspace_id: txn.workspace_id,
          transaction_id: txn.id,
          kind,
          file_path: path,
          file_name: file.name.slice(0, 200),
          mime_type: contentType,
          size_bytes: file.size,
        })
        .select()
        .single();
      if (error || !data) return fail(error?.message ?? "Could not save the document.");
      return ok(data as ExpenseDocument);
    },
  });
}

export async function updateDocument(id: string, patch: { kind?: ExpenseDocKind; note?: string | null }): Promise<Result<true>> {
  const { error } = await supabase.from("expense_documents").update(patch).eq("id", id);
  if (error) return fail(error.message);
  return ok(true);
}

export async function deleteDocument(doc: Pick<ExpenseDocument, "id" | "file_path">): Promise<Result<true>> {
  const { error } = await supabase.from("expense_documents").delete().eq("id", doc.id);
  if (error) return fail(error.message);
  await removeAttachments([doc.file_path]);
  return ok(true);
}
