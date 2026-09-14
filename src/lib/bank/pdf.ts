// Reads a PDF page by page into positioned text and horizontal ruling lines,
// which the bank statement parsers use to find columns and rows.
// Pure module: no Supabase or Next.js imports, so it also runs under tsx.
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";

export interface TextItem {
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

export interface TextLine {
  top: number;
  bottom: number;
  x0: number;
  x1: number;
  text: string;
  items: TextItem[];
}

export interface PageLayout {
  page: number;
  width: number;
  height: number;
  items: TextItem[];
  lines: TextLine[];
  hRules: number[]; // y (top-down) of horizontal ruling lines, sorted
}

export interface PdfLayout {
  text: string;
  pages: PageLayout[];
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

// PDF `cm`: the new CTM is M x CTM (row vectors).
function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const MIN_RULE_LENGTH = 30;

export async function loadPdfLayout(bytes: Uint8Array): Promise<PdfLayout> {
  const pdfjs = await getResolvedPDFJS();
  const OPS = pdfjs.OPS;
  // pdf.js may transfer (detach) the buffer it is given, so hand it a copy.
  const doc = await getDocumentProxy(bytes.slice());
  const pages: PageLayout[] = [];
  try {
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const vp = page.getViewport({ scale: 1 });
      const toView = (x: number, y: number) => vp.convertToViewportPoint(x, y) as [number, number];

      const items: TextItem[] = [];
      const content = await page.getTextContent();
      for (const raw of content.items) {
        if (!("str" in raw) || !raw.str.trim()) continue;
        const t = raw.transform as number[];
        const [vx, vy] = toView(t[4], t[5]);
        const h = Math.abs(raw.height) || Math.hypot(t[2], t[3]) || 8;
        items.push({ text: raw.str, x0: vx, x1: vx + raw.width, top: vy - h, bottom: vy });
      }

      const ruleYs: number[] = [];
      const addSegment = (ctm: Matrix, ax: number, ay: number, bx: number, by: number) => {
        const [px, py] = apply(ctm, ax, ay);
        const [qx, qy] = apply(ctm, bx, by);
        const [vx1, vy1] = toView(px, py);
        const [vx2, vy2] = toView(qx, qy);
        if (Math.abs(vy1 - vy2) < 0.5 && Math.abs(vx1 - vx2) >= MIN_RULE_LENGTH) ruleYs.push((vy1 + vy2) / 2);
      };

      const ops = await page.getOperatorList();
      let ctm: Matrix = IDENTITY;
      const stack: Matrix[] = [];
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i] as unknown;
        if (fn === OPS.save) stack.push(ctm);
        else if (fn === OPS.restore) ctm = stack.pop() ?? IDENTITY;
        else if (fn === OPS.transform) ctm = multiply(args as Matrix, ctm);
        else if (fn === OPS.paintFormXObjectBegin) {
          stack.push(ctm);
          const matrix = Array.isArray(args) ? (args[0] as Matrix | null) : null;
          if (matrix) ctm = multiply(matrix, ctm);
        } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? IDENTITY;
        else if (fn === OPS.constructPath) walkPath(args, ctm, OPS, addSegment);
      }

      pages.push({
        page: pageNo,
        width: vp.width,
        height: vp.height,
        items,
        lines: groupLines(items),
        hRules: clusterValues(ruleYs, 1),
      });
      page.cleanup();
    }
  } finally {
    await releaseDocument(doc);
  }
  return { pages, text: pages.map((p) => p.lines.map((l) => l.text).join("\n")).join("\n") };
}

export async function releaseDocument(doc: unknown) {
  const d = doc as { destroy?: () => unknown; cleanup?: () => unknown };
  if (typeof d.destroy === "function") await d.destroy();
  else if (typeof d.cleanup === "function") await d.cleanup();
}

type SegmentSink =(ctm: Matrix, ax: number, ay: number, bx: number, by: number) => void;

function walkPath(args: unknown, ctm: Matrix, OPS: Record<string, number>, add: SegmentSink) {
  if (!Array.isArray(args)) throw new Error("Unsupported pdf.js operator format");

  // pdf.js >= 5: [paintOp, [Float32Array | null], minMax], path encoded with DrawOPS codes.
  if (typeof args[0] === "number" && Array.isArray(args[1])) {
    if (args[0] === OPS.endPath) return; // clipping path, not drawn
    const buf = args[1][0] as ArrayLike<number> | null | undefined;
    if (!buf) return;
    let i = 0;
    let cx = 0, cy = 0, sx = 0, sy = 0;
    while (i < buf.length) {
      const code = buf[i];
      if (code === 0) { cx = sx = buf[i + 1]; cy = sy = buf[i + 2]; i += 3; }
      else if (code === 1) { add(ctm, cx, cy, buf[i + 1], buf[i + 2]); cx = buf[i + 1]; cy = buf[i + 2]; i += 3; }
      else if (code === 2) { cx = buf[i + 5]; cy = buf[i + 6]; i += 7; }
      else if (code === 3) { cx = buf[i + 3]; cy = buf[i + 4]; i += 5; }
      else if (code === 4) { add(ctm, cx, cy, sx, sy); cx = sx; cy = sy; i += 1; }
      else throw new Error(`Unsupported path code ${code}`);
    }
    return;
  }

  // pdf.js <= 4: [ops[], coords[], minMax].
  if (Array.isArray(args[0]) && Array.isArray(args[1])) {
    const opsList = args[0] as number[];
    const c = args[1] as number[];
    let j = 0;
    let cx = 0, cy = 0, sx = 0, sy = 0;
    for (const op of opsList) {
      if (op === OPS.moveTo) { cx = sx = c[j]; cy = sy = c[j + 1]; j += 2; }
      else if (op === OPS.lineTo) { add(ctm, cx, cy, c[j], c[j + 1]); cx = c[j]; cy = c[j + 1]; j += 2; }
      else if (op === OPS.curveTo) { cx = c[j + 4]; cy = c[j + 5]; j += 6; }
      else if (op === OPS.curveTo2 || op === OPS.curveTo3) { cx = c[j + 2]; cy = c[j + 3]; j += 4; }
      else if (op === OPS.closePath) { add(ctm, cx, cy, sx, sy); cx = sx; cy = sy; }
      else if (op === OPS.rectangle) {
        const [x, y, w, h] = [c[j], c[j + 1], c[j + 2], c[j + 3]];
        add(ctm, x, y, x + w, y);
        add(ctm, x, y + h, x + w, y + h);
        cx = sx = x; cy = sy = y;
        j += 4;
      }
    }
    return;
  }

  throw new Error("Unsupported pdf.js operator format");
}

export function groupLines(items: TextItem[]): TextLine[] {
  const sorted = [...items].sort((a, b) => a.bottom - b.bottom || a.x0 - b.x0);
  const lines: TextLine[] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.bottom - it.bottom) <= 2);
    if (line) line.items.push(it);
    else lines.push({ top: it.top, bottom: it.bottom, x0: it.x0, x1: it.x1, text: "", items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x0 - b.x0);
    l.top = Math.min(...l.items.map((i) => i.top));
    l.x0 = l.items[0].x0;
    l.x1 = Math.max(...l.items.map((i) => i.x1));
    l.text = joinItems(l.items);
  }
  return lines.sort((a, b) => a.bottom - b.bottom);
}

export function joinItems(items: TextItem[]): string {
  let out = "";
  let prev: TextItem | null = null;
  for (const it of items) {
    if (prev && it.x0 - prev.x1 > 1) out += " ";
    out += it.text;
    prev = it;
  }
  return out.replace(/\s+/g, " ").trim();
}

function clusterValues(values: number[], tolerance: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const v of sorted) {
    const g = groups[groups.length - 1];
    if (g && v - g[g.length - 1] <= tolerance) g.push(v);
    else groups.push([v]);
  }
  return groups.map((g) => g.reduce((s, v) => s + v, 0) / g.length);
}
