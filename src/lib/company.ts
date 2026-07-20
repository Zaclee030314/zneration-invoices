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

// Receipts and quotations get their own number series per bucket so they never
// collide with invoices: receipts EVRC/ZMRC, quotations EVQT/ZMQT.
export const RECEIPT_PREFIX: Record<InvoiceCategory, string> = { EVIV: "EVRC", ZMIV: "ZMRC" };
export const QUOTATION_PREFIX: Record<InvoiceCategory, string> = { EVIV: "EVQT", ZMIV: "ZMQT" };

// The number-series key (and invoice_counters row) for a doc: invoices use the
// category itself (EVIV/ZMIV); receipts EVRC/ZMRC; quotations EVQT/ZMQT.
export function seriesPrefix(docType: DocType, category: InvoiceCategory): string {
  if (docType === "receipt") return RECEIPT_PREFIX[category];
  if (docType === "quotation") return QUOTATION_PREFIX[category];
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
export function docFooter(docType: DocType): { line1: string; thanks: string; enquiry: string } {
  if (docType === "quotation") {
    return {
      line1: "This quotation is valid for 30 days from the date shown above.",
      thanks: "We look forward to working with you!",
      enquiry: `Should you have any enquiries concerning this quotation, please contact ${COMPANY.contact} on ${COMPANY.tel}`,
    };
  }
  return {
    line1: `Make all checks payable to ${COMPANY.name}`,
    thanks: "Thank you for your business!",
    enquiry: `Should you have any enquiries concerning this ${docType}, please contact ${COMPANY.contact} on ${COMPANY.tel}`,
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
