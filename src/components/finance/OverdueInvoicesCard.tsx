"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchOverdueInvoices } from "@/lib/queries/finance";
import { daysOverdue } from "@/lib/finance";
import { formatRM } from "@/lib/company";
import { formatDate } from "@/lib/labels";
import type { InvoiceBalance } from "@/lib/types";

// Dashboard card: invoices past their due date with money still owed.
export function OverdueInvoicesCard() {
  const [rows, setRows] = useState<InvoiceBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOverdueInvoices().then((res) => {
      if (cancelled) return;
      if (res.error !== null) setError(res.error);
      else setRows(res.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const outstanding = rows.reduce((sum, r) => sum + Number(r.balance), 0);

  return (
    <div className="bg-white border rounded p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Overdue invoices</p>
        {!loading && rows.length > 0 && (
          <p className="text-sm font-semibold text-red-700">RM {formatRM(outstanding)}</p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500 mt-2">Loading...</p>
      ) : error ? (
        <p className="text-sm text-red-600 mt-2">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-500 mt-2">All clear — nothing overdue.</p>
      ) : (
        <ul className="mt-3 divide-y">
          {rows.map((r) => {
            const days = daysOverdue(r.due_date);
            return (
              <li key={r.id}>
                <Link href={`/invoices/${r.id}`} className="flex items-center gap-3 py-2 text-sm hover:bg-neutral-50 -mx-1 px-1 rounded">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {r.invoice_no}
                      <span className="font-normal text-neutral-500"> · {r.bill_to_name}</span>
                    </p>
                    <p className="text-xs text-neutral-500">
                      Due {formatDate(r.due_date)}
                      {days > 0 && <span className="text-red-700"> · {days} day{days === 1 ? "" : "s"} overdue</span>}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-medium">RM {formatRM(Number(r.balance))}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
