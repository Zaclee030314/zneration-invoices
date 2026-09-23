// Checks the bank statement parsers against a folder of statement PDFs and,
// optionally, a baseline JSON of known transactions (kept outside the repo).
// Usage: npm run verify:bank -- --pdfs <dir with "UOB ..."/"PBB ..." folders> [--baseline <json>] [--force-fallback]
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadPdfLayout } from "../src/lib/bank/pdf";
import { parseStatementLayout, toImportRows } from "../src/lib/bank";
import { formatCents } from "../src/lib/bank/money";
import type { ParsedStatement } from "../src/lib/bank/types";

interface BaselineTxn {
  bank: string;
  stmt: string;
  date: string;
  deposit: number;
  withdrawal: number;
  balance: number | null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const cents = (n: number) => Math.round(n * 100);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function compare(st: ParsedStatement, base: BaselineTxn[]): string[] {
  const diffs: string[] = [];
  if (base.length !== st.transactions.length) diffs.push(`read ${st.transactions.length}, baseline has ${base.length}`);
  for (let i = 0; i < Math.min(base.length, st.transactions.length); i++) {
    const t = st.transactions[i];
    const b = base[i];
    const date = st.bank === "UOB" ? t.txnDate : t.postedOn;
    const dep = t.direction === "in" ? t.amountCents : 0;
    const wd = t.direction === "out" ? t.amountCents : 0;
    if (date !== b.date || dep !== cents(b.deposit) || wd !== cents(b.withdrawal) || (b.balance !== null && t.balanceCents !== cents(b.balance))) {
      diffs.push(`#${i + 1}: ${date} in ${formatCents(dep)} out ${formatCents(wd)} bal ${formatCents(t.balanceCents)} vs baseline ${b.date} in ${b.deposit} out ${b.withdrawal} bal ${b.balance}`);
    }
  }
  return diffs;
}

async function main() {
  const pdfDir = arg("--pdfs");
  const baselinePath = arg("--baseline");
  const forceFallback = process.argv.includes("--force-fallback");
  if (!pdfDir) {
    console.error("Usage: npm run verify:bank -- --pdfs <dir> [--baseline <json>] [--force-fallback]");
    process.exit(2);
  }
  const baseline: BaselineTxn[] | null = baselinePath ? JSON.parse(await readFile(baselinePath, "utf8")) : null;

  // Either "<BANK> <year>" sub-folders (bank checked against detection) or PDFs directly in the folder.
  const files: { bank: string | null; stmt: string; file: string }[] = [];
  for (const entry of await readdir(pdfDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
      files.push({ bank: null, stmt: path.parse(entry.name).name, file: path.join(pdfDir, entry.name) });
    }
    if (!entry.isDirectory()) continue;
    const bank = entry.name.split(/\s+/)[0].toUpperCase();
    for (const name of await readdir(path.join(pdfDir, entry.name))) {
      if (name.toLowerCase().endsWith(".pdf")) files.push({ bank, stmt: path.parse(name).name, file: path.join(pdfDir, entry.name, name) });
    }
  }
  const sortKey = (stmt: string) => {
    const m = stmt.match(/(\d{4})[^A-Za-z0-9]+([A-Za-z]{3})[A-Za-z]*$/);
    return m ? Number(m[1]) * 100 + MONTHS.indexOf(m[2].toLowerCase()) : MONTHS.indexOf(stmt.slice(0, 3).toLowerCase());
  };
  files.sort((a, b) => (a.bank ?? "").localeCompare(b.bank ?? "") || sortKey(a.stmt) - sortKey(b.stmt));
  if (!files.length) {
    console.error(`No PDF statements found in ${pdfDir}`);
    process.exit(1);
  }

  let failures = 0;
  const all: ParsedStatement[] = [];
  for (const f of files) {
    const label = (f.bank ? `${f.bank} ${f.stmt}` : f.stmt).padEnd(14);
    let st: ParsedStatement;
    try {
      st = parseStatementLayout(await loadPdfLayout(new Uint8Array(await readFile(f.file))), { forceFallback });
    } catch (e) {
      failures++;
      console.log(`FAIL ${label} ${(e as Error).message}`);
      continue;
    }
    all.push(st);
    const problems = st.checks.filter((c) => !c.ok).map((c) => `${c.code}: ${c.message}`);
    if (f.bank && st.bank !== f.bank) problems.push(`detected as ${st.bank}`);
    if (baseline) problems.push(...compare(st, baseline.filter((b) => b.bank === f.bank && b.stmt === f.stmt)));
    if (problems.length) failures++;
    console.log(
      `${problems.length ? "FAIL" : "ok  "} ${label} ${String(st.transactions.length).padStart(3)} txns  ${st.periodStart}..${st.periodEnd}  ` +
        `in ${formatCents(st.totalInCents).padStart(10)}  out ${formatCents(st.totalOutCents).padStart(10)}  ${st.segmentation}`
    );
    for (const p of problems.slice(0, 8)) console.log(`       ${p}`);
    for (const w of st.warnings) console.log(`       warning: ${w}`);
  }

  const rows = all.flatMap((st) => toImportRows(st).map((r, i) => ({ st, t: st.transactions[i], r })));
  const txns = rows.map((x) => x.t);
  const outPositive = txns.filter((t) => t.direction === "out" && t.amountCents > 0);
  const sum = (list: { t: { amountCents: number } }[]) => formatCents(list.reduce((s, x) => s + x.t.amountCents, 0));
  console.log("");
  console.log(`statements ${all.length}/${files.length}, transactions ${txns.length}`);
  console.log(`money out: ${outPositive.length} lines = RM${formatCents(outPositive.reduce((s, t) => s + t.amountCents, 0))}, zero lines ${txns.filter((t) => t.amountCents === 0).length}`);

  const seen = new Set<string>();
  let duplicateFingerprints = 0;
  for (const { st, r } of rows) {
    const key = `${st.bank}|${st.accountNo}|${r.fingerprint}`;
    if (seen.has(key)) duplicateFingerprints++;
    seen.add(key);
  }
  console.log(`fingerprints: ${seen.size} unique, ${duplicateFingerprints} duplicate(s)`);
  if (duplicateFingerprints) failures++;

  const ownOut = rows.filter((x) => x.r.direction === "out" && x.r.category === "own_transfer");
  const ownIn = rows.filter((x) => x.r.direction === "in" && x.r.category === "own_transfer");
  console.log(`own transfers: ${ownOut.length} out = RM${sum(ownOut)}, ${ownIn.length} in = RM${sum(ownIn)}`);
  for (const x of ownOut) {
    const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
    const pair = ownIn.find((y) => y.st.bank !== x.st.bank && y.t.amountCents === x.t.amountCents && days(y.t.txnDate, x.t.txnDate) <= 3);
    console.log(`  ${x.st.bank} ${x.t.txnDate} RM${formatCents(x.t.amountCents).padStart(9)} ${x.t.txnType} -> ${x.r.counterparty}${pair ? `  (received ${pair.st.bank} ${pair.t.txnDate})` : "  NO MATCHING CREDIT"}`);
  }

  const byCategory = new Map<string, typeof rows>();
  for (const x of rows.filter((x) => x.r.direction === "out" && x.t.amountCents > 0)) {
    const key = x.r.category ?? "(uncategorised)";
    byCategory.set(key, [...(byCategory.get(key) ?? []), x]);
  }
  console.log("money out by suggested category:");
  for (const [key, list] of [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${key.padEnd(18)} ${String(list.length).padStart(4)}  RM${sum(list).padStart(10)}`);
  }
  if (process.argv.includes("--show-rows")) {
    for (const x of rows) {
      console.log(`${x.st.bank} ${x.t.txnDate} ${x.t.direction} ${formatCents(x.t.amountCents).padStart(9)} [${x.r.category ?? "-"}] type=${x.r.txn_type} | cp=${x.r.counterparty} | ref=${x.r.reference}`);
    }
  }
  console.log(failures ? `${failures} statement(s) FAILED` : "all statements passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
