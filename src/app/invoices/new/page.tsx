"use client";
import { AuthGuard } from "@/components/AuthGuard";
import { InvoiceForm } from "@/components/InvoiceForm";

export default function NewInvoicePage() {
  return (
    <AuthGuard>
      <h1 className="text-2xl font-semibold mb-6">New Invoice</h1>
      <InvoiceForm />
    </AuthGuard>
  );
}
