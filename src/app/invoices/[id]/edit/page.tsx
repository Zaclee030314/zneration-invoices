"use client";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { InvoiceForm } from "@/components/InvoiceForm";
import { supabase } from "@/lib/supabase/client";
import type { InvoiceWithItems } from "@/lib/types";

export default function EditInvoicePage({ params }: { params: { id: string } }) {
  const [invoice, setInvoice] = useState<InvoiceWithItems | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("id", params.id)
      .single()
      .then(({ data }) => {
        setInvoice(data as InvoiceWithItems);
        setLoading(false);
      });
  }, [params.id]);

  return (
    <AuthGuard>
      <h1 className="text-2xl font-semibold mb-6">Edit Invoice</h1>
      {loading ? <p className="text-sm text-neutral-500">Loading...</p> : invoice ? <InvoiceForm existing={invoice} /> : <p>Not found.</p>}
    </AuthGuard>
  );
}
