// Public Bank monthly account statement ("PENYATA AKAUN / STATEMENT OF ACCOUNT").
// Rows show only day/month; the year comes from the statement date. A date is
// printed only on the first transaction of each day, so a row starts at every
// line with a debit or credit amount. Lines without amounts continue the row
// above, including at the top of the next page after "Balance B/F".
import { groupLines, joinItems, type PdfLayout, type TextItem, type TextLine } from "./pdf";
import { MONEY_RE, formatCents, parseMoney } from "./money";
import type { ParsedStatement, ParsedTxn } from "./types";
import { PARSER_VERSION, StatementFormatError, balanceBreaks, centerY, check, datesOutside, summarise } from "./common";

type AmountCol = "debit" | "credit" | "balance";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const DAY_MONTH_RE = /^(\d{2})\/(\d{2})$/;
// Interbank trace numbers such as 20260803PBBEMYKL010OCB00220819: never useful to people.
const TRACE_RE = /^\d{8}[A-Z0-9]{12,}$/;
const MASKED_ACCOUNT_RE = /^\d*X{3,}\d*\s+/;

export function looksLikePbbMonthly(text: string): boolean {
  return /PENYATA AKAUN \/ STATEMENT OF ACCOUNT/i.test(text) && /Account Number/i.test(text) && /Public Bank/i.test(text);
}

interface Header {
  bottom: number;
  descX0: number;
  amountX0: number;
  rightEdges: Record<AmountCol, number>;
}

function findHeader(lines: TextLine[]): Header | null {
  for (const line of lines) {
    const find = (re: RegExp) => line.items.find((i) => re.test(i.text.trim()));
    const date = find(/^DATE$/);
    const desc = find(/^TRANSACTION$/);
    const debit = find(/^DEBIT$/);
    const credit = find(/^CREDIT$/);
    const balance = find(/^BALANCE$/);
    if (date && desc && debit && credit && balance) {
      return {
        bottom: line.bottom,
        descX0: desc.x0,
        amountX0: debit.x0 - 10,
        rightEdges: { debit: debit.x1, credit: credit.x1, balance: balance.x1 },
      };
    }
  }
  return null;
}

// Amounts are right-aligned under their column heading.
function amountColumn(item: TextItem, header: Header): AmountCol {
  let best: AmountCol = "balance";
  let bestGap = Infinity;
  for (const col of ["debit", "credit", "balance"] as AmountCol[]) {
    const gap = Math.abs(item.x1 - header.rightEdges[col]);
    if (gap < bestGap) {
      best = col;
      bestGap = gap;
    }
  }
  return best;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Names and payment notes share one printed line ("DSWISS SDN. BHD. PRODUCT SAMPLING FEE"),
// so a company name is cut after its legal suffix and a name printed twice is kept once.
function splitName(text: string): { name: string | null; note: string | null } {
  const legal = text.match(/^(.*?\b(?:SDN\.?\s*BHD\.?|BERHAD|BHD\.?|S\/B|PLT|ENTERPRISES?))(?:\s+(.*))?$/i);
  if (legal) return { name: legal[1].trim(), note: legal[2]?.trim() || null };
  const words = text.split(" ");
  const half = words.length / 2;
  if (words.length >= 4 && Number.isInteger(half) && words.slice(0, half).join(" ") === words.slice(half).join(" ")) {
    return { name: words.slice(0, half).join(" "), note: null };
  }
  return { name: text.trim() || null, note: null };
}

function describe(lines: string[]): Pick<ParsedTxn, "txnType" | "reference" | "counterparty"> {
  const clean = lines
    .map((l) => l.split(" ").filter((w) => !TRACE_RE.test(w)).join(" ").trim())
    .filter(Boolean);
  const [first = "", ...rest] = clean;
  const head = first.match(/^(.*?)\s+(\d{6})(?:\s+(.*))?$/);
  const txnType = (head ? head[1] : first).trim() || null;
  const onFirstLine = head?.[3]?.trim() || null;
  const join = (parts: (string | null)[]) => parts.filter(Boolean).join(" ") || null;

  if (txnType && /CR CARD PYMT/i.test(txnType)) {
    const card = rest.join(" ").match(/\b\d{12}(\d{4})\b/);
    return { txnType, counterparty: card ? `Credit card ending ${card[1]}` : "Credit card", reference: null };
  }
  if (txnType && /^DEP-ECP/i.test(txnType)) {
    const payer = rest.find((l) => !/^IMEPS\d+$/i.test(l));
    const { name, note } = payer ? splitName(payer.replace(/\s+(UOB|MBB|CIMB|RHB|HLB|PBB|AMB|BSN|OCBC|HSBC)$/i, "")) : { name: null, note: null };
    return { txnType, counterparty: name, reference: note };
  }
  if (!txnType || !/^(DUITNOW|TSFR FUND|IBG|INSTANT|FPX|JOMPAY)/i.test(txnType)) {
    return { txnType, reference: join([...rest, onFirstLine]), counterparty: null };
  }
  if (/QR/i.test(txnType)) {
    const refAt = rest.findIndex((l) => /^QR REF NO:/i.test(l));
    const name = refAt >= 0 ? rest[refAt + 1] ?? null : null;
    return { txnType, reference: null, counterparty: name };
  }
  if (onFirstLine) {
    const { name, note } = splitName(onFirstLine);
    return { txnType, counterparty: name, reference: join([note, ...rest]) };
  }
  const [nameLine = "", ...refs] = rest;
  const { name, note } = splitName(nameLine.replace(MASKED_ACCOUNT_RE, ""));
  return { txnType, counterparty: name, reference: join([note, ...refs]) };
}

interface Draft {
  page: number;
  postedOn: string;
  lines: string[];
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

export function parsePbbMonthly(layout: PdfLayout): ParsedStatement {
  const text = layout.text;
  const account = text.match(/Account Number\s+(\d{6,})/i);
  const stmtDate = text.match(/Statement Date\s+(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})/i);
  const name = text.match(/^(.*?)\s+PENYATA AKAUN/m);
  if (!account || !stmtDate) {
    throw new StatementFormatError("Could not find the account number or statement date in this Public Bank statement.");
  }
  const endYear = parseInt(stmtDate[3], 10);
  const endMonth = MONTHS[stmtDate[2].toLowerCase()];
  if (!endMonth) throw new StatementFormatError(`Unrecognised statement date "${stmtDate[0]}".`);
  const periodEnd = isoDate(endYear, endMonth, parseInt(stmtDate[1], 10));
  const yearFor = (month: number) => (month > endMonth ? endYear - 1 : endYear);

  const summaryAmount = (label: RegExp) => {
    const m = text.match(label);
    return m ? parseMoney(m[1]) : null;
  };
  const summaryCount = (label: RegExp) => {
    const m = text.match(label);
    return m ? parseInt(m[1], 10) : null;
  };
  const declaredClosing = summaryAmount(/Closing Balance\s+(-?[\d,]*\d\.\d{2})/i);
  const declaredOut = summaryAmount(/Total Debits\s+(-?[\d,]*\d\.\d{2})/i);
  const declaredIn = summaryAmount(/Total Credits\s+(-?[\d,]*\d\.\d{2})/i);
  const debitCount = summaryCount(/No\. of Debits\s+(\d+)/i);
  const creditCount = summaryCount(/No\. of Credits\s+(\d+)/i);

  const drafts: Draft[] = [];
  const warnings: string[] = [];
  const problems: string[] = [];
  let openingCents: number | null = null;
  let closingCents: number | null = null;
  let openingDate: string | null = null;
  let currentDate: string | null = null;
  let current: Draft | null = null;
  let closed = false;

  for (const page of layout.pages) {
    if (closed) break;
    const header = findHeader(page.lines);
    if (!header) continue;
    const footer = page.lines.find((l) => l.top > header.bottom && /^(Penyata ini dicetak|Baki Harian|PERHATIAN)/i.test(l.text));
    const bottom = footer ? footer.top : page.height;

    for (const line of groupLines(page.items.filter((i) => centerY(i) > header.bottom && centerY(i) < bottom))) {
      const dateItem = line.items.find((i) => i.x1 < header.descX0 && DAY_MONTH_RE.test(i.text.trim()));
      if (dateItem) {
        const [, dd, mm] = dateItem.text.trim().match(DAY_MONTH_RE) as RegExpMatchArray;
        currentDate = isoDate(yearFor(parseInt(mm, 10)), parseInt(mm, 10), parseInt(dd, 10));
      }
      const amounts: Partial<Record<AmountCol, number>> = {};
      const words: TextItem[] = [];
      for (const item of line.items) {
        if (item === dateItem) continue;
        if (item.x0 >= header.amountX0 && MONEY_RE.test(item.text.trim())) {
          const col = amountColumn(item, header);
          if (amounts[col] !== undefined) problems.push(`page ${page.page}: two ${col} amounts on one line`);
          amounts[col] = parseMoney(item.text);
        } else words.push(item);
      }
      const label = joinItems(words);

      if (/^Balance From Last Statement/i.test(label)) {
        openingCents = amounts.balance ?? null;
        openingDate = currentDate;
        continue;
      }
      if (/^Closing Balance In This Statement/i.test(label)) {
        closingCents = amounts.balance ?? null;
        closed = true;
        break;
      }
      if (/^Balance (B\/F|C\/F)$/i.test(label)) continue;

      if (amounts.debit !== undefined || amounts.credit !== undefined) {
        if (!currentDate) {
          problems.push(`page ${page.page}: "${label.slice(0, 40)}" has no date`);
          continue;
        }
        current = {
          page: page.page,
          postedOn: currentDate,
          lines: label ? [label] : [],
          debit: amounts.debit ?? null,
          credit: amounts.credit ?? null,
          balance: amounts.balance ?? null,
        };
        drafts.push(current);
      } else if (current && label) {
        current.lines.push(label);
      } else if (label) {
        warnings.push(`page ${page.page}: skipped "${label.slice(0, 40)}" above the first transaction`);
      }
    }
  }

  const transactions: ParsedTxn[] = [];
  let running = openingCents ?? 0;
  let unprinted = 0;
  for (const d of drafts) {
    const description = d.lines.join(" ").replace(/\s+/g, " ").trim();
    if (d.debit !== null && d.credit !== null) {
      problems.push(`${d.postedOn} "${description.slice(0, 40)}": both a debit and a credit`);
      continue;
    }
    const direction = d.credit !== null ? "in" : "out";
    const amountCents = (direction === "in" ? d.credit : d.debit) as number;
    if (amountCents < 0) {
      problems.push(`${d.postedOn} "${description.slice(0, 40)}": negative amount`);
      continue;
    }
    running += direction === "in" ? amountCents : -amountCents;
    if (d.balance === null) unprinted++;
    transactions.push({
      seq: transactions.length + 1,
      page: d.page,
      postedOn: d.postedOn,
      txnDate: d.postedOn,
      txnAt: null,
      direction,
      amountCents,
      balanceCents: d.balance ?? running,
      descLines: d.lines,
      description,
      ...describe(d.lines),
    });
    if (d.balance !== null) running = d.balance;
  }
  if (unprinted) warnings.push(`${unprinted} row(s) had no printed balance, so the balance was calculated.`);

  const periodStart = openingDate ? nextDay(openingDate) : isoDate(endYear, endMonth, 1);
  const totalInCents = transactions.filter((t) => t.direction === "in").reduce((s, t) => s + t.amountCents, 0);
  const totalOutCents = transactions.filter((t) => t.direction === "out").reduce((s, t) => s + t.amountCents, 0);
  const inCount = transactions.filter((t) => t.direction === "in").length;
  const outCount = transactions.length - inCount;
  const declaredCount = debitCount !== null && creditCount !== null ? debitCount + creditCount : null;

  const checks = [
    check(
      "rows_read",
      problems.length === 0,
      problems.length ? `Could not read ${problems.length} row(s): ${summarise(problems)}` : `Read ${transactions.length} transactions`
    ),
    check(
      "record_count",
      debitCount === outCount && creditCount === inCount,
      declaredCount === null
        ? "Number of debits and credits not found on the statement"
        : `Statement lists ${debitCount} debits and ${creditCount} credits, read ${outCount} and ${inCount}`
    ),
    check(
      "opening_closing",
      openingCents !== null && closingCents !== null && closingCents === declaredClosing,
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
  const totalsMatch = declaredIn === totalInCents && declaredOut === totalOutCents;
  checks.push(
    check(
      "declared_totals",
      totalsMatch && openingCents !== null && closingCents !== null && openingCents + totalInCents - totalOutCents === closingCents,
      declaredIn === null || declaredOut === null
        ? "Total debits and credits not found on the statement"
        : totalsMatch
          ? `Credits RM${formatCents(totalInCents)} and debits RM${formatCents(totalOutCents)} match the statement totals`
          : `Statement totals RM${formatCents(declaredIn)} in / RM${formatCents(declaredOut)} out, read RM${formatCents(totalInCents)} / RM${formatCents(totalOutCents)}`
    )
  );
  const outside = datesOutside(transactions, periodStart, periodEnd);
  checks.push(
    check(
      "dates_in_period",
      outside.length === 0,
      outside.length ? `${outside.length} transaction(s) dated outside ${periodStart} – ${periodEnd}` : "All dates are inside the statement period"
    )
  );

  return {
    bank: "PBB",
    accountNo: account[1],
    accountName: name?.[1].trim() || null,
    periodStart,
    periodEnd,
    openingCents: openingCents ?? 0,
    closingCents: closingCents ?? 0,
    totalInCents,
    totalOutCents,
    declaredCount,
    declaredInCents: declaredIn,
    declaredOutCents: declaredOut,
    segmentation: "n/a",
    transactions,
    checks,
    warnings,
    ok: checks.every((c) => c.ok),
    parserVersion: PARSER_VERSION,
  };
}
