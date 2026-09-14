"use client";
import { DocumentList } from "@/components/DocumentList";

export default function ReceiptsPage() {
  return (
    <DocumentList
      docType="receipt"
      title="Receipts"
      basePath="/receipts"
      newHref="/receipts/new"
      newLabel="+ New Receipt"
    />
  );
}
