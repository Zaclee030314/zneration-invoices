"use client";
import { DocumentList } from "@/components/DocumentList";

export default function InvoicesPage() {
  return (
    <DocumentList
      docType="invoice"
      title="Invoices"
      basePath="/invoices"
      newHref="/invoices/new"
      newLabel="+ New Invoice"
    />
  );
}
