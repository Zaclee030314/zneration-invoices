"use client";
import { Suspense } from "react";
import { InvoiceForm } from "@/components/InvoiceForm";

export default function NewQuotationPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">New Quotation</h1>
      <Suspense fallback={<p className="text-sm text-neutral-500">Loading...</p>}>
        <InvoiceForm docType="quotation" />
      </Suspense>
    </>
  );
}
