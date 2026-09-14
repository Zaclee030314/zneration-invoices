import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase/server";
import { ATTACHMENTS_BUCKET } from "@/lib/attachment-rules";
import { parseStatementPdf, StatementFormatError, toImportRows, type ParsedStatement } from "@/lib/bank";
import { centsToDecimal } from "@/lib/bank/money";
import type { StatementImportResult, StatementPreview } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const MISSING_TABLES = "The Expenses tables are not set up yet. Run supabase/migrations/010_expenses.sql in the Supabase SQL editor first.";

type Db = ReturnType<typeof supabaseForRequest>;

function friendly(message: string): string {
  return /(bank_accounts|bank_statements|bank_transactions|import_bank_statement)/.test(message) &&
    /(does not exist|could not find|schema cache)/i.test(message)
    ? MISSING_TABLES
    : message;
}

async function existingFingerprints(db: Db, accountId: string, from: string, to: string): Promise<Set<string>> {
  const known = new Set<string>();
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await db
      .from("bank_transactions")
      .select("id, fingerprint")
      .eq("account_id", accountId)
      .gte("posted_on", from)
      .lte("posted_on", to)
      .order("id")
      .range(start, start + PAGE - 1);
    if (error) throw new Error(friendly(error.message));
    for (const row of data ?? []) known.add(row.fingerprint as string);
    if (!data || data.length < PAGE) break;
  }
  return known;
}

// POST /api/expenses/statements { mode: "preview" | "import", statementId, path, fileName }
// Reads a statement PDF the browser has already uploaded to storage and checks it.
// "preview" reports what an import would add; "import" stores it. The PDF is always
// parsed here, so what gets stored never depends on the browser.
export async function POST(req: Request) {
  const db = supabaseForRequest(req);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const {
    data: { user },
  } = await db.auth.getUser(token || undefined);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: membership } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const workspaceId = membership?.workspace_id as string | undefined;
  if (!workspaceId) return NextResponse.json({ error: "No workspace." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { mode?: string; statementId?: string; path?: string; fileName?: string };
  const mode = body.mode === "import" ? "import" : "preview";
  const statementId = body.statementId ?? "";
  const path = body.path ?? "";
  if (
    !UUID_RE.test(statementId) ||
    !path.startsWith(`${workspaceId}/statements/${statementId}/`) ||
    path.includes("..") ||
    !path.toLowerCase().endsWith(".pdf")
  ) {
    return NextResponse.json({ error: "Invalid statement upload." }, { status: 400 });
  }
  const fileName = (body.fileName || path.split("/").pop() || "statement.pdf").slice(0, 200);

  const { data: blob, error: downloadError } = await db.storage.from(ATTACHMENTS_BUCKET).download(path);
  if (downloadError || !blob) {
    return NextResponse.json({ error: downloadError?.message || "Could not read the uploaded file." }, { status: 404 });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  let statement: ParsedStatement;
  try {
    statement = await parseStatementPdf(bytes);
  } catch (e) {
    const message = e instanceof StatementFormatError ? e.message : `Could not read this statement: ${(e as Error).message}`;
    return NextResponse.json({ error: message }, { status: 422 });
  }
  const rows = toImportRows(statement);

  const { data: account, error: accountError } = await db
    .from("bank_accounts")
    .select("id, label")
    .eq("workspace_id", workspaceId)
    .eq("bank", statement.bank)
    .eq("account_no", statement.accountNo)
    .maybeSingle();
  if (accountError) return NextResponse.json({ error: friendly(accountError.message) }, { status: 500 });

  let alreadyImported: StatementPreview["alreadyImported"] = null;
  let overlapping: StatementPreview["overlapping"] = [];
  let duplicateCount = 0;
  if (account) {
    const [same, overlaps] = await Promise.all([
      db.from("bank_statements").select("id, file_name, created_at").eq("account_id", account.id).eq("file_sha256", sha256).maybeSingle(),
      db
        .from("bank_statements")
        .select("id, file_name, period_start, period_end")
        .eq("account_id", account.id)
        .lte("period_start", statement.periodEnd)
        .gte("period_end", statement.periodStart),
    ]);
    alreadyImported = same.data ?? null;
    overlapping = (overlaps.data ?? []).filter((s) => s.id !== same.data?.id);
    try {
      const known = await existingFingerprints(db, account.id, statement.periodStart, statement.periodEnd);
      duplicateCount = rows.filter((r) => known.has(r.fingerprint)).length;
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  const preview: StatementPreview = {
    bank: statement.bank,
    accountNo: statement.accountNo,
    accountName: statement.accountName,
    accountId: account?.id ?? null,
    accountLabel: account?.label ?? null,
    periodStart: statement.periodStart,
    periodEnd: statement.periodEnd,
    openingBalance: statement.openingCents / 100,
    closingBalance: statement.closingCents / 100,
    totalIn: statement.totalInCents / 100,
    totalOut: statement.totalOutCents / 100,
    txnCount: rows.length,
    moneyOutCount: rows.filter((r) => r.direction === "out").length,
    checks: statement.checks,
    warnings: statement.warnings,
    ok: statement.ok,
    segmentation: statement.segmentation,
    alreadyImported,
    overlapping,
    newCount: rows.length - duplicateCount,
    duplicateCount,
  };
  if (mode === "preview") return NextResponse.json({ preview });

  if (!statement.ok) {
    return NextResponse.json({ error: "This statement did not pass the checks, so it was not imported.", preview }, { status: 422 });
  }

  const { data, error } = await db.rpc("import_bank_statement", {
    p_workspace: workspaceId,
    p_statement: {
      id: statementId,
      bank: statement.bank,
      account_no: statement.accountNo,
      account_name: statement.accountName,
      period_start: statement.periodStart,
      period_end: statement.periodEnd,
      file_path: path,
      file_name: fileName,
      file_sha256: sha256,
      opening_balance: centsToDecimal(statement.openingCents),
      closing_balance: centsToDecimal(statement.closingCents),
      total_in: centsToDecimal(statement.totalInCents),
      total_out: centsToDecimal(statement.totalOutCents),
      txn_count: rows.length,
      parser_version: statement.parserVersion,
      validation: { checks: statement.checks, warnings: statement.warnings, segmentation: statement.segmentation },
    },
    p_rows: rows,
  });
  if (error) return NextResponse.json({ error: friendly(error.message), preview }, { status: 400 });
  return NextResponse.json({ result: data as StatementImportResult, preview });
}
