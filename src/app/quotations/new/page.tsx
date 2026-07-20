"use client";
import { AuthGuard } from "@/components/AuthGuard";
import { InvoiceForm } from "@/components/InvoiceForm";

export default function NewQuotationPage() {
  return (
    <AuthGuard>
      <h1 className="text-2xl font-semibold mb-6">New Quotation</h1>
      <InvoiceForm docType="quotation" />
    </AuthGuard>
  );
}
