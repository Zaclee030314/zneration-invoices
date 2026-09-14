import { loadPdfLayout, type PdfLayout } from "./pdf";
import { looksLikePbb, parsePbb } from "./pbb";
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

export function parseStatementLayout(layout: PdfLayout, opts: ParseOptions = {}): ParsedStatement {
  let statement: ParsedStatement;
  if (looksLikePbb(layout.text)) statement = parsePbb(layout);
  else if (looksLikeUob(layout.text)) statement = parseUob(layout, opts);
  else {
    throw new StatementFormatError(
      "This PDF is not a supported bank statement. Upload the UOB Account Activities export or the Public Bank account statement."
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
