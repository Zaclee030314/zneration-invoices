import { loadPdfLayout, type PdfLayout } from "./pdf";
import { looksLikePbb, parsePbb } from "./pbb";
import { looksLikePbbMonthly, parsePbbMonthly } from "./pbb-monthly";
import { looksLikeUob, parseUob } from "./uob";
import { StatementFormatError } from "./common";
import { describePbb, describeUob } from "./counterparty";
import { suggestCategory } from "./categorise";
import { assignFingerprints } from "./fingerprint";
import { centsToDecimal } from "./money";
import type { ImportRow, ParsedStatement } from "./types";

export { StatementFormatError } from "./common";
export type { ParsedStatement, ParsedTxn, BankCode, ValidationCheck, ImportRow, TxnCategory } from "./types";

export interface ParseOptions {
  forceFallback?: boolean;
}

// Fees the bank charges itself: shown as paid to the bank rather than as the bank's internal codes.
const BANK_NAMES: Record<ParsedStatement["bank"], string> = { PBB: "Public Bank", UOB: "UOB" };
function nameBankCharges(statement: ParsedStatement): ParsedStatement {
  for (const t of statement.transactions) {
    const type = (t.txnType ?? "").replace(/-$/, "").trim().toUpperCase();
    if (t.counterparty || !/^(SC|SST DR|SERVICE CHARGE)$/.test(type)) continue;
    t.counterparty = BANK_NAMES[statement.bank];
    t.reference = type === "SST DR" ? "SST on service charge" : "Service charge";
  }
  return statement;
}

export function parseStatementLayout(layout: PdfLayout, opts: ParseOptions = {}): ParsedStatement {
  return nameBankCharges(readStatement(layout, opts));
}

function readStatement(layout: PdfLayout, opts: ParseOptions): ParsedStatement {
  // The monthly statement reader fills in payee and reference itself.
  if (looksLikePbbMonthly(layout.text)) return parsePbbMonthly(layout);
  let statement: ParsedStatement;
  if (looksLikePbb(layout.text)) statement = parsePbb(layout);
  else if (looksLikeUob(layout.text)) statement = parseUob(layout, opts);
  else {
    throw new StatementFormatError(
      "This PDF is not a supported bank statement. Upload the UOB Account Activities export, the Public Bank account activity print or the Public Bank monthly statement."
    );
  }
  for (const t of statement.transactions) {
    Object.assign(t, statement.bank === "UOB" ? describeUob(t.descLines) : describePbb(t.description, t.txnType));
  }
  return statement;
}

export async function parseStatementPdf(bytes: Uint8Array, opts: ParseOptions = {}): Promise<ParsedStatement> {
  let layout: PdfLayout;
  try {
    layout = await loadPdfLayout(bytes);
  } catch (e) {
    throw new StatementFormatError(`Could not read this PDF: ${(e as Error).message}`);
  }
  return parseStatementLayout(layout, opts);
}

export function toImportRows(statement: ParsedStatement): ImportRow[] {
  const fingerprints = assignFingerprints(statement.transactions);
  return statement.transactions.map((t, i) => ({
    seq: t.seq,
    page: t.page,
    posted_on: t.postedOn,
    txn_date: t.txnDate,
    txn_at: t.txnAt,
    direction: t.direction,
    amount: centsToDecimal(t.amountCents),
    balance: centsToDecimal(t.balanceCents),
    description: t.description,
    desc_lines: t.descLines,
    txn_type: t.txnType,
    reference: t.reference,
    counterparty: t.counterparty,
    fingerprint: fingerprints[i],
    category: suggestCategory(statement.bank, statement.accountName, t),
  }));
}
