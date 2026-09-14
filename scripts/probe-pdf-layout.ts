// Dev tool: prints what the PDF layout reader sees on one page of a statement.
// Usage: npx tsx scripts/probe-pdf-layout.ts <file.pdf> [page]
import { readFile } from "node:fs/promises";
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";
import { loadPdfLayout, releaseDocument } from "../src/lib/bank/pdf";

function describe(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    ArrayBuffer.isView(v) ? `${v.constructor.name}(${(v as unknown as ArrayLike<number>).length}) [${Array.from(v as unknown as ArrayLike<number>).slice(0, 16).join(",")}]` : v
  ).slice(0, 400);
}

async function main() {
  const [file, pageArg] = process.argv.slice(2);
  if (!file) {
    console.error("Usage: npx tsx scripts/probe-pdf-layout.ts <file.pdf> [page]");
    process.exit(1);
  }
  const pageNo = Number(pageArg || 1);
  const bytes = new Uint8Array(await readFile(file));

  const { OPS } = await getResolvedPDFJS();
  const doc = await getDocumentProxy(bytes.slice());
  const page = await doc.getPage(pageNo);
  const ops = await page.getOperatorList();
  let shown = 0;
  const counts = new Map<number, number>();
  for (let i = 0; i < ops.fnArray.length; i++) {
    counts.set(ops.fnArray[i], (counts.get(ops.fnArray[i]) ?? 0) + 1);
    if (ops.fnArray[i] === OPS.constructPath && shown < 3) {
      console.log("constructPath args:", describe(ops.argsArray[i]));
      shown++;
    }
  }
  const opName = new Map(Object.entries(OPS).map(([k, v]) => [v as number, k]));
  console.log("operator counts:", [...counts.entries()].map(([k, v]) => `${opName.get(k) ?? k}=${v}`).join(" "));
  await releaseDocument(doc);

  const layout = await loadPdfLayout(bytes);
  const p = layout.pages[pageNo - 1];
  console.log(`page ${pageNo}/${layout.pages.length}: ${p.width}x${p.height}, items ${p.items.length}, lines ${p.lines.length}, hRules ${p.hRules.length}`);
  console.log("hRules:", p.hRules.map((y) => y.toFixed(1)).join(" "));
  for (const l of p.lines.slice(0, 70)) {
    console.log(`${l.top.toFixed(1).padStart(6)}-${l.bottom.toFixed(1).padStart(6)} | ${l.items.map((it) => `[${it.x0.toFixed(0)}-${it.x1.toFixed(0)}]${it.text}`).join(" ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
