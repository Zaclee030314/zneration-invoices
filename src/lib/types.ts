export type InvoiceCategory = "EVIV" | "ZMIV";
export type DocType = "invoice" | "receipt";

export interface Client {
  id: string;
  owner_id: string;
  name: string;
  reg_no: string | null;
  address: string | null;
  default_category: InvoiceCategory | null;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  line_total: number | null;
  sort_order: number;
}

export interface Invoice {
  id: string;
  owner_id: string;
  invoice_no: string;
  doc_type: DocType;
  category: InvoiceCategory;
  client_id: string | null;
  bill_to_name: string;
  bill_to_reg_no: string | null;
  bill_to_address: string | null;
  invoice_date: string;
  bank_name: string | null;
  bank_account: string | null;
  sales_tax_rate: number;
  discount: number;
  special_notes: string | null;
  created_at: string;
}

export interface InvoiceWithItems extends Invoice {
  invoice_items: InvoiceItem[];
}

export function invoiceSubtotal(items: Pick<InvoiceItem, "line_total">[]): number {
  return items.reduce((sum, it) => sum + (it.line_total ?? 0), 0);
}

export function invoiceTotals(invoice: Pick<Invoice, "sales_tax_rate" | "discount">, items: Pick<InvoiceItem, "line_total">[]) {
  const subtotal = invoiceSubtotal(items);
  const salesTax = (subtotal * (invoice.sales_tax_rate || 0)) / 100;
  const total = subtotal + salesTax - (invoice.discount || 0);
  return { subtotal, salesTax, total };
}
