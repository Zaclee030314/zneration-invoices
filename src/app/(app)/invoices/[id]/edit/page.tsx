"use client";
import { DocumentEdit } from "@/components/DocumentEdit";

export default function EditInvoicePage({ params }: { params: { id: string } }) {
  return <DocumentEdit id={params.id} />;
}
