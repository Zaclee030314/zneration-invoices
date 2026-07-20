"use client";
import { DocumentList } from "@/components/DocumentList";

export default function QuotationsPage() {
  return (
    <DocumentList
      docType="quotation"
      title="Quotations"
      basePath="/quotations"
      newHref="/quotations/new"
      newLabel="+ New Quotation"
    />
  );
}
