// UOB business banking "Account Activities" PDF export.
// Each transaction is one table row between two horizontal ruling lines. The
// statement date, amounts and balance sit on one line in the vertical middle of
// the row; the description and transaction time wrap above and below it.
import { groupLines, type PageLayout, type PdfLayout, type TextItem } from "./pdf";
import { DMY_RE, MONEY_RE, dmyToIso, formatCents, parseMoney, to24h } from "./money";
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
  signedCents,
  summarise,
  type Column,
} from "./common";

type Col = "stmtDate" | "txnDate" | "desc" | "deposit" | "withdrawal" | "balance";
type Draft = Omit<ParsedTxn, "seq">;

const HEADERS: [Col, RegExp][] = [
  ["stmtDate", /^Statement Date/i],
  ["txnDate", /^Transaction Date/i],
  ["desc", /^Description/i],
  ["deposit", /^Deposit/i],
  ["withdrawal", /^Withdrawal/i],
  ["balance", /^Ledger Balance/i],
];

const DATETIME_RE = /(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(AM|PM)?/i;
// Lines inside a row are ~3pt apart (top of one to bottom of the previous); rows are ~12pt apart.
const ROW_GAP = 7;

export function looksLikeUob(text: string): boolean {
  return /Account Activities/i.test(text) && /Ledger Balance\(MYR\)/i.test(text);
}

interface Table {
  pageNo: number;
  cols: Column<Col>[];
  items: TextItem[];
  rules: number[];
}

function findTable(page: PageLayout): Table | null {
  for (const line of page.lines) {
    const cols: Column<Col>[] = [];
    for (const [key, re] of HEADERS) {
      const item = line.items.find((i) => re.test(i.text.trim()));
      if (!item) break;
      cols.push({ key, x0: item.x0 });
    }
    if (cols.length !== HEADERS.length) continue;
    cols.sort((a, b) => a.x0 - b.x0);
    const top = line.bottom;
    const end = page.lines.find((l) => l.top > top && /^(Total Deposits|Date of Export)/i.test(l.text));
    const bottom = end ? end.top : page.height;
    return {
      pageNo: page.page,
      cols,
      items: page.items.filter((i) => centerY(i) > top && centerY(i) < bottom),
      rules: page.hRules.filter((y) => y > top && y < bottom),
    };
  }
  return null;
}

function bandsByRules(t: Table): TextItem[][] | null {
  if (!t.items.length) return [];
  if (t.rules.length < 2) return null;
  const bands: TextItem[][] = t.rules.slice(1).map(() => []);
  for (const item of t.items) {
    const y = centerY(item);
    const index = bands.findIndex((_, i) => y > t.rules[i] && y < t.rules[i + 1]);
    if (index < 0) return null;
    bands[index].push(item);
  }
  return bands.filter((b) => b.length > 0);
}

function bandsByGaps(items: TextItem[]): TextItem[][] {
  const bands: TextItem[][] = [];
  let maxBottom = -Infinity;
  for (const item of [...items].sort((a, b) => a.top - b.top)) {
    if (!bands.length || item.top - maxBottom > ROW_GAP) {
      bands.push([]);
      maxBottom = -Infinity;
    }
    bands[bands.length - 1].push(item);
    maxBottom = Math.max(maxBottom, item.bottom);
  }
  return bands;
}

function cleanDescription(lines: string[]): string {
  return lines.join(" ").replace(/\|+/g, " ").replace(/\s+/g, " ").trim();
}

type BandResult = { txn: Draft } | { continuation: string[] } | { problem: string };

function readBand(items: TextItem[], cols: Column<Col>[], pageNo: number): BandResult {
  const inCol = (key: Col) => items.filter((i) => columnAt(centerX(i), cols) === key);
  const descLines = groupLines(inCol("desc")).map((l) => l.text).filter(Boolean);
  const anchors = inCol("stmtDate").filter((i) => DMY_RE.test(i.text.trim()));
  if (!anchors.length) return { continuation: descLines };

  const where = `page ${pageNo}, ${anchors[0].text.trim()}`;
  if (anchors.length > 1) return { problem: `${where}: ${anchors.length} dates in one row` };

  const money = (key: Col) => inCol(key).filter((i) => MONEY_RE.test(i.text.trim()));
  const [dep, wd, bal] = [money("deposit"), money("withdrawal"), money("balance")];
  if (dep.length !== 1 || wd.length !== 1 || bal.length !== 1) {
    return { problem: `${where}: could not read the deposit, withdrawal and balance` };
  }
  const depositCents = parseMoney(dep[0].text);
  const withdrawalCents = parseMoney(wd[0].text);
  if (depositCents < 0 || withdrawalCents < 0 || (depositCents > 0 && withdrawalCents > 0)) {
    return { problem: `${where}: unexpected deposit ${dep[0].text} with withdrawal ${wd[0].text}` };
  }

  const when = groupLines(inCol("txnDate")).map((l) => l.text).join(" ").match(DATETIME_RE);
  if (!when) return { problem: `${where}: no transaction date and time` };

  const txnDate = dmyToIso(when[1]);
  const direction = depositCents > 0 ? "in" : "out";
  return {
    txn: {
      page: pageNo,
      postedOn: dmyToIso(anchors[0].text),
      txnDate,
      txnAt: `${txnDate}T${to24h(when[2], when[3] ?? null)}+08:00`,
      direction,
      amountCents: direction === "in" ? depositCents : withdrawalCents,
      balanceCents: parseMoney(bal[0].text),
      descLines,
      description: cleanDescription(descLines),
      txnType: descLines[0] ?? null,
      reference: null,
      counterparty: null,
    },
  };
}

function segment(tables: Table[], mode: "rulings" | "text-fallback") {
  const rows: Draft[] = [];
  const problems: string[] = [];
  const warnings: string[] = [];
  for (const t of tables) {
    const bands = mode === "rulings" ? bandsByRules(t) : bandsByGaps(t.items);
    if (!bands) {
      problems.push(`page ${t.pageNo}: text outside the ruled rows`);
      continue;
    }
    bands.forEach((band, i) => {
      const r = readBand(band, t.cols, t.pageNo);
      if ("txn" in r) rows.push(r.txn);
      else if ("problem" in r) problems.push(r.problem);
      else if (i === 0 && rows.length) {
        const prev = rows[rows.length - 1];
        prev.descLines.push(...r.continuation);
        prev.description = cleanDescription(prev.descLines);
        warnings.push(`page ${t.pageNo}: a row continues from the previous page`);
      } else if (r.continuation.length) {
        problems.push(`page ${t.pageNo}: "${r.continuation.join(" ").slice(0, 40)}" has no date`);
      }
    });
  }
  return { rows, problems, warnings };
}

export function parseUob(layout: PdfLayout, opts: { forceFallback?: boolean } = {}): ParsedStatement {
  const text = layout.text;
  const account = text.match(/(\d{8,16}) (.+?) MYR \1/);
  const period = text.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
  if (!account || !period) {
    throw new StatementFormatError("Could not find the account number or statement period in this UOB export.");
  }
  const tables = layout.pages.map(findTable).filter((t): t is Table => t !== null);
  if (!tables.length) throw new StatementFormatError("Could not find the transactions table in this UOB export.");

  const warnings: string[] = [];
  let segmentation: "rulings" | "text-fallback" = opts.forceFallback ? "text-fallback" : "rulings";
  let seg = segment(tables, segmentation);
  if (segmentation === "rulings" && seg.problems.length) {
    const fallback = segment(tables, "text-fallback");
    if (fallback.problems.length < seg.problems.length) {
      warnings.push("The row lines in this PDF could not be used, so rows were split by text spacing instead.");
      seg = fallback;
      segmentation = "text-fallback";
    }
  }
  warnings.push(...seg.warnings);

  const transactions: ParsedTxn[] = seg.rows.map((r, i) => ({ seq: i + 1, ...r }));
  const periodStart = dmyToIso(period[1]);
  const periodEnd = dmyToIso(period[2]);
  const totalInCents = transactions.filter((t) => t.direction === "in").reduce((s, t) => s + t.amountCents, 0);
  const totalOutCents = transactions.filter((t) => t.direction === "out").reduce((s, t) => s + t.amountCents, 0);
  const first = transactions[0];
  const last = transactions[transactions.length - 1];
  const openingCents = first ? first.balanceCents - signedCents(first) : 0;
  const closingCents = last ? last.balanceCents : 0;

  const records = text.match(/(\d+)\s*Record\(s\)/i);
  const declaredCount = records ? parseInt(records[1], 10) : null;
  const totals = text.match(/Total Deposits\(MYR\)\s*Total Withdrawals\(MYR\)\s*\n\s*(-?[\d,]*\d\.\d{2})\s+(-?[\d,]*\d\.\d{2})/i);
  const declaredInCents = totals ? parseMoney(totals[1]) : null;
  const declaredOutCents = totals ? parseMoney(totals[2]) : null;

  const checks = [
    check(
      "rows_read",
      seg.problems.length === 0,
      seg.problems.length ? `Could not read ${seg.problems.length} row(s): ${summarise(seg.problems)}` : `Read ${transactions.length} transactions`
    ),
    check(
      "record_count",
      declaredCount === transactions.length,
      declaredCount === null ? "Record count not found on the statement" : `Statement lists ${declaredCount} records, read ${transactions.length}`
    ),
  ];
  const breaks = first ? balanceBreaks(transactions.slice(1), first.balanceCents) : [];
  checks.push(check("balance_chain", breaks.length === 0, breaks.length ? `Running balance breaks: ${summarise(breaks)}` : "Every running balance adds up"));
  const totalsMatch = declaredInCents === totalInCents && declaredOutCents === totalOutCents;
  checks.push(
    check(
      "declared_totals",
      totalsMatch,
      declaredInCents === null || declaredOutCents === null
        ? "Total deposits and withdrawals not found on the statement"
        : totalsMatch
          ? `Deposits RM${formatCents(totalInCents)} and withdrawals RM${formatCents(totalOutCents)} match the statement totals`
          : `Statement totals RM${formatCents(declaredInCents)} in / RM${formatCents(declaredOutCents)} out, read RM${formatCents(totalInCents)} / RM${formatCents(totalOutCents)}`
    )
  );
  const outside = datesOutside(transactions, periodStart, periodEnd);
  checks.push(
    check(
      "dates_in_period",
      outside.length === 0,
      outside.length ? `${outside.length} transaction(s) dated outside ${period[1]} - ${period[2]}` : "All dates are inside the statement period"
    )
  );

  return {
    bank: "UOB",
    accountNo: account[1],
    accountName: account[2].trim() || null,
    periodStart,
    periodEnd,
    openingCents,
    closingCents,
    totalInCents,
    totalOutCents,
    declaredCount,
    declaredInCents,
    declaredOutCents,
    segmentation,
    transactions,
    checks,
    warnings,
    ok: checks.every((c) => c.ok),
    parserVersion: PARSER_VERSION,
  };
}
