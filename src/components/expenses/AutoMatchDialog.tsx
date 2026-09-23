"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatDate } from "@/lib/labels";
import { formatRM } from "@/lib/company";
import { proposeLinks, type ProposedLink } from "@/lib/receipts";
import { fetchAllCredits, fetchUnlinkedPayments, linkPayments, toMatchCredit } from "@/lib/queries/receipts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Finds bank credits for payments already recorded on invoices and links the
// ones that are unambiguous, after the team has looked at the list.
export function AutoMatchDialog({ open, onOpenChange, onLinked }: { open: boolean; onOpenChange: (open: boolean) => void; onLinked: () => void }) {
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<ProposedLink[]>([]);
  const [unlinkedCount, setUnlinkedCount] = useState(0);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchUnlinkedPayments(), fetchAllCredits()]).then(([pays, credits]) => {
      if (cancelled) return;
      setLoading(false);
      if (pays.error !== null) return toast.error(pays.error);
      if (credits.error !== null) return toast.error(credits.error);
      const found = proposeLinks(pays.data, credits.data.map(toMatchCredit)).sort((a, b) => a.credit.txn_date.localeCompare(b.credit.txn_date));
      setUnlinkedCount(pays.data.length);
      setProposals(found);
      setChosen(new Set(found.map((f) => f.payment.id)));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    const links = proposals.filter((p) => chosen.has(p.payment.id)).map((p) => ({ payment_id: p.payment.id, bank_transaction_id: p.credit.id }));
    if (!links.length) return;
    setSaving(true);
    const res = await linkPayments(links);
    setSaving(false);
    if (res.error !== null) return toast.error(res.error);
    toast.success(`Linked ${res.data} payment${res.data === 1 ? "" : "s"} to the bank statement.`);
    onOpenChange(false);
    onLinked();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Match recorded payments to the bank</DialogTitle>
          <DialogDescription>
            Payments already recorded on invoices, paired with the bank credit of the same amount within 3 days. Only clear pairs are listed: the only
            candidate, or clearly the right payer by name or invoice number. Untick any that look wrong.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-neutral-500">Looking for matches...</p>
        ) : proposals.length === 0 ? (
          <p className="text-sm text-neutral-600">
            {unlinkedCount === 0 ? "Every recorded payment is already linked to the bank." : `No clear matches for the ${unlinkedCount} recorded payment(s) that are not linked yet. Link them one by one from Money received.`}
          </p>
        ) : (
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead className="border-b bg-neutral-50 text-left">
                <tr>
                  <th className="w-8 p-2">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={chosen.size === proposals.length}
                      onChange={() => setChosen(chosen.size === proposals.length ? new Set() : new Set(proposals.map((p) => p.payment.id)))}
                    />
                  </th>
                  <th className="p-2">Bank credit</th>
                  <th className="p-2">Invoice</th>
                  <th className="p-2 text-right">Amount (RM)</th>
                  <th className="p-2">Why</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.payment.id} className="border-b last:border-0 align-top">
                    <td className="p-2">
                      <input type="checkbox" aria-label="Link this pair" checked={chosen.has(p.payment.id)} onChange={() => toggle(p.payment.id)} />
                    </td>
                    <td className="p-2">
                      <span className="whitespace-nowrap">{formatDate(p.credit.txn_date)}</span>
                      <span className="block text-xs text-neutral-500">{p.credit.counterparty || p.credit.reference || p.credit.description.slice(0, 40)}</span>
                    </td>
                    <td className="p-2">
                      <span className="font-medium">{p.payment.invoice_no}</span>
                      <span className="block text-xs text-neutral-500">
                        {p.payment.bill_to_name} · recorded {formatDate(p.payment.paid_on)}
                      </span>
                    </td>
                    <td className="p-2 text-right tabular-nums">{formatRM(p.payment.amount)}</td>
                    <td className="p-2 text-xs text-neutral-600">{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && proposals.length > 0 && unlinkedCount > proposals.length && (
          <p className="text-xs text-neutral-500">
            {unlinkedCount - proposals.length} other recorded payment(s) have no clear bank credit (several possible, or none within 3 days). Link those from the
            bank line on Money received.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Close
          </Button>
          <Button type="button" onClick={apply} disabled={saving || loading || chosen.size === 0}>
            {saving ? "Linking..." : `Link ${chosen.size} payment${chosen.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
