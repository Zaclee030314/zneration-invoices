import type { DocType, InvoiceCategory } from "./types";

export const COMPANY = {
  name: "Zneration Media M Sdn Bhd",
  regNo: "202401048026 (1593871-M)",
  address: "21D Faber Plaza Business Centre, Jalan Desa Jaya, Taman Desa, Malaysia, KL, 58100",
  tel: "012-5417233",
  email: "znerationmedia@gmail.com",
  contact: "Zac",
};

export const CATEGORY_LABELS: Record<InvoiceCategory, string> = {
  EVIV: "Event Invoice",
  ZMIV: "Other Invoice (Marketing / AI)",
};

export const CATEGORY_DEFAULTS: Record<InvoiceCategory, { bankName: string; bankAccount: string; specialNotes: string }> = {
  EVIV: {
    bankName: "PBB",
    bankAccount: "3243091730",
    specialNotes: "Upon cancellation of event, fees will be refunded fully.",
  },
  ZMIV: {
    bankName: "UOB",
    bankAccount: "9113012893",
    specialNotes: "",
  },
};

// Receipts get their own number series per bucket so they never collide with
// invoices: event receipts EVRC…, marketing receipts ZMRC….
export const RECEIPT_PREFIX: Record<InvoiceCategory, string> = { EVIV: "EVRC", ZMIV: "ZMRC" };

// The number-series key (and invoice_counters row) for a doc: invoices use the
// category itself (EVIV/ZMIV); receipts use the receipt prefix (EVRC/ZMRC).
export function seriesPrefix(docType: DocType, category: InvoiceCategory): string {
  return docType === "receipt" ? RECEIPT_PREFIX[category] : category;
}

export const DOC_TITLE: Record<DocType, string> = { invoice: "Invoice", receipt: "Receipt" };
export const DOC_NUMBER_LABEL: Record<DocType, string> = { invoice: "INV#", receipt: "RCP#" };

export function docBasePath(docType: DocType): string {
  return docType === "receipt" ? "/receipts" : "/invoices";
}

export function currentYymm(date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yy}${mm}`;
}

export function formatRM(amount: number): string {
  return amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
