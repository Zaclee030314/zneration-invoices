"use client";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { InvoiceForm } from "@/components/InvoiceForm";
import { supabase } from "@/lib/supabase/client";
import { DOC_TITLE } from "@/lib/company";
import type { InvoiceWithItems } from "@/lib/types";

export function DocumentEdit({ id }: { id: string }) {
  const [invoice, setInvoice] = useState<InvoiceWithItems | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setInvoice(data as InvoiceWithItems);
        setLoading(false);
      });
  }, [id]);

  return (
    <AuthGuard>
      <h1 className="text-2xl font-semibold mb-6">
        {invoice ? `Edit ${DOC_TITLE[invoice.doc_type]}` : "Edit"}
      </h1>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : invoice ? (
        <InvoiceForm existing={invoice} />
      ) : (
        <p>Not found.</p>
      )}
    </AuthGuard>
  );
}
