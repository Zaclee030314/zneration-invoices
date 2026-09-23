import type { DocType, InvoiceCategory } from "./types";

// Letterhead printed on the active company's documents.
export interface CompanyDetails {
  name: string;
  regNo: string;
  address: string;
  tel: string;
  email: string;
  contact: string;
}

export const SERIES_COLORS = ["amber", "sky", "emerald", "violet", "rose", "teal", "orange", "neutral"] as const;
export type SeriesColor = (typeof SERIES_COLORS)[number];

// One invoice number series (stored on documents as `category`). Receipts and
// quotations made from it get their own series so numbers never collide.
export interface InvoiceSeries {
  key: string;
  label: string;
  receiptPrefix: string;
  quotationPrefix: string;
  bankName: string;
  bankAccount: string;
  specialNotes: string;
  color: SeriesColor;
}

export interface CompanyProfile {
  company: CompanyDetails;
  series: InvoiceSeries[];
}

export const SERIES_KEY_RE = /^[A-Z][A-Z0-9]{1,7}$/;

// Zneration's letterhead and series before they were stored per company (and
// the fallback while migration 011 has not been run).
export const ZNERATION_PROFILE: CompanyProfile = {
  company: {
    name: "Zneration Media M Sdn Bhd",
    regNo: "202401048026 (1593871-M)",
    address: "21D Faber Plaza Business Centre, Jalan Desa Jaya, Taman Desa, Malaysia, KL, 58100",
    tel: "012-5417233",
    email: "znerationmedia@gmail.com",
    contact: "Zac",
  },
  series: [
    {
      key: "EVIV",
      label: "Event Invoice",
      receiptPrefix: "EVRC",
      quotationPrefix: "EVQT",
      bankName: "PBB",
      bankAccount: "3243091730",
      specialNotes: "Upon cancellation of event, fees will be refunded fully.",
      color: "amber",
    },
    {
      key: "ZMIV",
      label: "Other Invoice (Marketing / AI)",
      receiptPrefix: "ZMRC",
      quotationPrefix: "ZMQT",
      bankName: "UOB",
      bankAccount: "9113012893",
      specialNotes: "",
      color: "sky",
    },
  ],
};

const EMPTY_COMPANY: CompanyDetails = { name: "", regNo: "", address: "", tel: "", email: "", contact: "" };

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Receipt/quotation series when none is set: EVIV -> EVRC / EVQT.
export function derivedPrefix(key: string, suffix: "RC" | "QT"): string {
  return /IV$/.test(key) ? key.replace(/IV$/, suffix) : `${key.slice(0, 6)}${suffix}`;
}

export function normaliseSeries(raw: unknown): InvoiceSeries | null {
  const s = (raw ?? {}) as Record<string, unknown>;
  const key = text(s.key).trim().toUpperCase();
  if (!SERIES_KEY_RE.test(key)) return null;
  const color = SERIES_COLORS.includes(s.color as SeriesColor) ? (s.color as SeriesColor) : "neutral";
  return {
    key,
    label: text(s.label) || key,
    receiptPrefix: text(s.receiptPrefix).toUpperCase() || derivedPrefix(key, "RC"),
    quotationPrefix: text(s.quotationPrefix).toUpperCase() || derivedPrefix(key, "QT"),
    bankName: text(s.bankName),
    bankAccount: text(s.bankAccount),
    specialNotes: text(s.specialNotes),
    color,
  };
}

// Reads workspaces.profile. A company that has not been set up shows its own
// name only; Zneration keeps its original details until migration 011 stores them.
export function resolveProfile(ws: { name?: string | null; profile?: unknown } | null): CompanyProfile {
  const raw = (ws?.profile ?? null) as { company?: Record<string, unknown>; series?: unknown[] } | null;
  if (!raw?.company && /zneration/i.test(ws?.name ?? "")) return ZNERATION_PROFILE;
  const c = raw?.company ?? {};
  return {
    company: {
      ...EMPTY_COMPANY,
      name: text(c.name) || ws?.name || "",
      regNo: text(c.regNo),
      address: text(c.address),
      tel: text(c.tel),
      email: text(c.email),
      contact: text(c.contact),
    },
    series: (Array.isArray(raw?.series) ? raw.series : []).map(normaliseSeries).filter((s): s is InvoiceSeries => s !== null),
  };
}

export function findSeries(series: InvoiceSeries[], key: InvoiceCategory): InvoiceSeries | undefined {
  return series.find((s) => s.key === key);
}

// The number-series key (and invoice_counters row) for a doc: invoices use the
// series itself (e.g. EVIV); receipts and quotations their own (EVRC, EVQT).
export function seriesPrefix(docType: DocType, category: InvoiceCategory, series: InvoiceSeries[]): string {
  const s = findSeries(series, category);
  if (docType === "receipt") return s?.receiptPrefix || derivedPrefix(category, "RC");
  if (docType === "quotation") return s?.quotationPrefix || derivedPrefix(category, "QT");
  return category;
}

export const DOC_TITLE: Record<DocType, string> = { invoice: "Invoice", receipt: "Receipt", quotation: "Quotation" };
export const DOC_NUMBER_LABEL: Record<DocType, string> = { invoice: "INV#", receipt: "RCP#", quotation: "QT#" };

export function docBasePath(docType: DocType): string {
  if (docType === "receipt") return "/receipts";
  if (docType === "quotation") return "/quotations";
  return "/invoices";
}

// Footer wording differs per document: quotations aren't payment requests, so
// they carry a validity note instead of the check/thank-you lines.
export function docFooter(docType: DocType, company: CompanyDetails): { line1: string; thanks: string; enquiry: string } {
  const contact = company.contact && company.tel ? `, please contact ${company.contact} on ${company.tel}` : company.tel ? `, please call ${company.tel}` : "";
  if (docType === "quotation") {
    return {
      line1: "This quotation is valid for 30 days from the date shown above.",
      thanks: "We look forward to working with you!",
      enquiry: contact ? `Should you have any enquiries concerning this quotation${contact}` : "",
    };
  }
  return {
    line1: `Make all checks payable to ${company.name}`,
    thanks: "Thank you for your business!",
    enquiry: contact ? `Should you have any enquiries concerning this ${docType}${contact}` : "",
  };
}

export function currentYymm(date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yy}${mm}`;
}

export function formatRM(amount: number): string {
  return amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
