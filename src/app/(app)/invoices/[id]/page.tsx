"use client";
import { DocumentDetail } from "@/components/DocumentDetail";

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  return <DocumentDetail id={params.id} />;
}
