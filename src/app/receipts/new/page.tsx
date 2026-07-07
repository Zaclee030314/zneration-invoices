"use client";
import { AuthGuard } from "@/components/AuthGuard";
import { InvoiceForm } from "@/components/InvoiceForm";

export default function NewReceiptPage() {
  return (
    <AuthGuard>
      <h1 className="text-2xl font-semibold mb-6">New Receipt</h1>
      <InvoiceForm docType="receipt" />
    </AuthGuard>
  );
}
