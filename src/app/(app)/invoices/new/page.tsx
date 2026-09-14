"use client";
import { Suspense } from "react";
import { InvoiceForm } from "@/components/InvoiceForm";

export default function NewInvoicePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">New Invoice</h1>
      <Suspense fallback={<p className="text-sm text-neutral-500">Loading...</p>}>
        <InvoiceForm />
      </Suspense>
    </>
  );
}
