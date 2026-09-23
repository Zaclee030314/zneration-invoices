"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import type { BankTransactionRow } from "@/lib/types";
import { formatDate } from "@/lib/labels";
import { formatRM } from "@/lib/company";
import { openAttachment } from "@/lib/attachments";
import { fetchStatementPath } from "@/lib/queries/expenses";
import { Button } from "@/components/ui/button";

// What the bank printed for one line, with a link to the statement PDF.
export function BankLineDetails({ row }: { row: BankTransactionRow }) {
  const [statementPath, setStatementPath] = useState<string | null>(null);
  const statementId = row.statement_id;
  const incoming = row.direction === "in";

  useEffect(() => {
    setStatementPath(null);
    if (!statementId) return;
    let cancelled = false;
    fetchStatementPath(statementId).then((res) => {
      if (!cancelled && res.error === null) setStatementPath(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [statementId]);

  async function viewStatement() {
    if (!statementPath) return;
    const error = await openAttachment(statementPath);
    if (error) toast.error(error);
  }

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">From the bank statement</h3>
      <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-neutral-500">Account</dt>
        <dd>
          {row.account_label} <span className="text-neutral-400">({row.account_no})</span>
        </dd>
        <dt className="text-neutral-500">{incoming ? "Received" : "Paid"}</dt>
        <dd>
          {row.txn_at
            ? new Date(row.txn_at).toLocaleString("en-MY", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: "Asia/Kuala_Lumpur",
              })
            : formatDate(row.txn_date)}
        </dd>
        {row.posted_on !== row.txn_date && (
          <>
            <dt className="text-neutral-500">Posted</dt>
            <dd>{formatDate(row.posted_on)}</dd>
          </>
        )}
        {row.txn_type && (
          <>
            <dt className="text-neutral-500">Type</dt>
            <dd>{row.txn_type}</dd>
          </>
        )}
        {row.counterparty && (
          <>
            <dt className="text-neutral-500">{incoming ? "From" : "Paid to"}</dt>
            <dd>{row.counterparty}</dd>
          </>
        )}
        {row.reference && (
          <>
            <dt className="text-neutral-500">Reference</dt>
            <dd className="break-words">{row.reference}</dd>
          </>
        )}
        <dt className="text-neutral-500">Balance after</dt>
        <dd>RM {formatRM(Number(row.balance))}</dd>
      </dl>
      <pre className="whitespace-pre-wrap break-words rounded border bg-neutral-50 p-2 font-mono text-xs text-neutral-700">
        {row.desc_lines?.length ? row.desc_lines.join("\n") : row.description}
      </pre>
      <Button type="button" size="sm" variant="outline" disabled={!statementPath} onClick={viewStatement}>
        <FileText /> View statement PDF
      </Button>
    </section>
  );
}
