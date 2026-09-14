// Public Bank account statement printout ("Account Summary - Savings / Current").
// A date in the date column starts a row; lines below it without a date continue
// its description, including at the top of the next page. The column header is
// only printed on the first page.
import { groupLines, joinItems, type PageLayout, type PdfLayout, type TextItem } from "./pdf";
import { DMY_RE, MONEY_RE, dmyToIso, formatCents, parseMoney } from "./money";
import type { ParsedStatement, ParsedTxn } from "./types";
import {
  PARSER_VERSION,
  StatementFormatError,
  balanceBreaks,
  centerX,
  centerY,
  check,
  columnAt,
  datesOutside,
  summarise,
  type Column,
} from "./common";

type Col = "date" | "desc" | "debit" | "credit" | "balance";

const HEADERS: [Col, RegExp][] = [
  ["date", /^Transaction Date/i],
  ["desc", /^Transaction Description/i],
  ["debit", /^Debit/i],
  ["credit", /^Credit/i],
  ["balance", /^Balance/i],
];

export function looksLikePbb(text: string): boolean {
  return /Account No\. \/ Name/i.test(text) && /Transaction Description/i.test(text);
}

interface Draft {
  page: number;
  postedOn: string;
  descLines: string[];
  debit: number[];
  credit: number[];
  balance: number[];
}

function findHeader(page: PageLayout) {
  for (const line of page.lines) {
    const cols: Column<Col>[] = [];
    for (const [key, re] of HEADERS) {
      const item = line.items.find((i) => re.test(i.text.trim()));
      if (!item) break;
      cols.push({ key, x0: item.x0 });
    }
    if (cols.length === HEADERS.length) return { line, cols: cols.sort((a, b) => a.x0 - b.x0) };
  }
  return null;
}

// "DUITNOW TRSF DR- NO:422940..." -> "DUITNOW TRSF DR-"; "TSFR FUND CR-ATM/EFT- NO:..." -> "TSFR FUND CR-ATM/EFT-"
function txnTypeOf(description: string): string | null {
  const m = description.match(/^(.{2,30}?-)(?=\s|$)/);
  return m ? m[1] : null;
}

export function parsePbb(layout: PdfLayout): ParsedStatement {
  const text = layout.text;
  const account = text.match(/Account No\. \/ Name\s*:\s*(\d{6,})\s*\/\s*(.+)/i);
  const from = text.match(/From Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const to = text.match(/To Date\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!account || !from || !to) {
    throw new StatementFormatError("Could not find the account number or statement period in this Public Bank statement.");
  }

  const drafts: Draft[] = [];
  const warnings: string[] = [];
  let cols: Column<Col>[] | null = null;
  let current: Draft | null = null;
  let closed = false;

  for (const page of layout.pages) {
    if (closed) break;
    const header = findHeader(page);
    if (header) cols = header.cols;
    if (!cols) continue;
    const tableCols = cols;
    const printed = page.lines.find((l) => /^Printed Date\/Time/i.test(l.text));
    const top = header ? header.line.bottom : printed ? printed.bottom : 0;
    const footer = page.lines.find((l) => l.top > top && /^(Note: This is a computer generated|Public Bank Berhad)/i.test(l.text));
    const bottom = footer ? footer.top : page.height;

    for (const line of groupLines(page.items.filter((i) => centerY(i) > top && centerY(i) < bottom))) {
      const dateItem = line.items.find((i) => DMY_RE.test(i.text.trim()) && columnAt(centerX(i), tableCols) === "date");
      if (dateItem) {
        current = { page: page.page, postedOn: dmyToIso(dateItem.text), descLines: [], debit: [], credit: [], balance: [] };
        drafts.push(current);
      } else if (!current) {
        warnings.push(`page ${page.page}: skipped "${line.text.slice(0, 40)}" above the first row`);
        continue;
      }
      const desc: TextItem[] = [];
      for (const item of line.items) {
        if (item === dateItem) continue;
        const col = columnAt(centerX(item), tableCols);
        if ((col === "debit" || col === "credit" || col === "balance") && MONEY_RE.test(item.text.trim())) {
          current[col].push(parseMoney(item.text));
        } else {
          desc.push(item);
        }
      }
      if (desc.length) current.descLines.push(joinItems(desc));
      if (dateItem && /^CLOSING BALANCE/i.test(joinItems(desc))) {
        closed = true;
        break;
      }
    }
  }

  const problems: string[] = [];
  const transactions: ParsedTxn[] = [];
  let openingCents: number | null = null;
  let closingCents: number | null = null;
  let running = 0;
  let unprinted = 0;

  for (const d of drafts) {
    const description = d.descLines.join(" ").replace(/\s+/g, " ").trim();
    const where = `${d.postedOn} "${description.slice(0, 40)}"`;
    if (/^OPENING BALANCE/i.test(description)) {
      openingCents = d.balance.length === 1 ? d.balance[0] : null;
      running = openingCents ?? 0;
      continue;
    }
    if (/^CLOSING BALANCE/i.test(description)) {
      closingCents = d.balance.length === 1 ? d.balance[0] : null;
      continue;
    }
    if (d.debit.length + d.credit.length !== 1 || d.balance.length > 1) {
      problems.push(`${where}: expected one debit or credit amount`);
      continue;
    }
    const direction = d.credit.length ? "in" : "out";
    const amountCents = direction === "in" ? d.credit[0] : d.debit[0];
    if (amountCents < 0) {
      problems.push(`${where}: negative amount`);
      continue;
    }
    running += direction === "in" ? amountCents : -amountCents;
    if (!d.balance.length) unprinted++;
    transactions.push({
      seq: transactions.length + 1,
      page: d.page,
      postedOn: d.postedOn,
      txnDate: d.postedOn,
      txnAt: null,
      direction,
      amountCents,
      balanceCents: d.balance[0] ?? running,
      descLines: d.descLines,
      description,
      txnType: txnTypeOf(description),
      reference: null,
      counterparty: null,
    });
    if (d.balance.length) running = d.balance[0];
  }

  const periodStart = dmyToIso(from[1]);
  const periodEnd = dmyToIso(to[1]);
  const totalInCents = transactions.filter((t) => t.direction === "in").reduce((s, t) => s + t.amountCents, 0);
  const totalOutCents = transactions.filter((t) => t.direction === "out").reduce((s, t) => s + t.amountCents, 0);
  if (unprinted) warnings.push(`${unprinted} row(s) had no printed balance, so the balance was calculated.`);

  const checks = [
    check(
      "rows_read",
      problems.length === 0,
      problems.length ? `Could not read ${problems.length} row(s): ${summarise(problems)}` : `Read ${transactions.length} transactions`
    ),
    check(
      "opening_closing",
      openingCents !== null && closingCents !== null,
      openingCents !== null && closingCents !== null
        ? `Opening balance RM${formatCents(openingCents)}, closing balance RM${formatCents(closingCents)}`
        : "Opening or closing balance not found"
    ),
  ];
  const breaks = balanceBreaks(transactions, openingCents ?? 0);
  checks.push(
    check(
      "balance_chain",
      openingCents !== null && breaks.length === 0,
      breaks.length ? `Running balance breaks: ${summarise(breaks)}` : "Every running balance adds up"
    )
  );
  const reconciles = openingCents !== null && closingCents !== null && openingCents + totalInCents - totalOutCents === closingCents;
  checks.push(
    check(
      "reconciles",
      reconciles,
      `Opening + credits RM${formatCents(totalInCents)} - debits RM${formatCents(totalOutCents)} ${reconciles ? "equals" : "does not equal"} the closing balance`
    )
  );
  const outside = datesOutside(transactions, periodStart, periodEnd);
  checks.push(
    check(
      "dates_in_period",
      outside.length === 0,
      outside.length ? `${outside.length} transaction(s) dated outside ${from[1]} - ${to[1]}` : "All dates are inside the statement period"
    )
  );

  return {
    bank: "PBB",
    accountNo: account[1],
    accountName: account[2].trim() || null,
    periodStart,
    periodEnd,
    openingCents: openingCents ?? 0,
    closingCents: closingCents ?? 0,
    totalInCents,
    totalOutCents,
    declaredCount: null,
    declaredInCents: null,
    declaredOutCents: null,
    segmentation: "n/a",
    transactions,
    checks,
    warnings,
    ok: checks.every((c) => c.ok),
    parserVersion: PARSER_VERSION,
  };
}
