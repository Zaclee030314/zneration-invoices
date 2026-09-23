"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { ClientPicker } from "./ClientPicker";
import { ProjectPicker } from "./ProjectPicker";
import { LineItemsEditor, type DraftItem } from "./LineItemsEditor";
import { DOC_TITLE, currentYymm, docBasePath, findSeries, seriesPrefix, formatRM } from "@/lib/company";
import { defaultDueDate } from "@/lib/finance";
import { loadDocumentPrefill } from "@/lib/documents";
import { linkScheduleInvoice } from "@/lib/queries/finance";
import { useWorkspace } from "@/lib/workspace";
import type { Client, DocType, InvoiceCategory, InvoiceWithItems, ProjectWithClient } from "@/lib/types";

function newItem(description = "", line_total = ""): DraftItem {
  return { key: crypto.randomUUID(), description, line_total };
}

// Friendlier message for the unique(owner_id, invoice_no) violation.
function dupMessage(msg: string, no: string): string {
  if (/duplicate|unique/i.test(msg)) {
    return `Document number "${no}" already exists. Choose a different number.`;
  }
  return msg;
}

// Raise the per-series monthly counter to at least this number's sequence, so
// the next auto-suggestion continues ascending (handles skipped/manual numbers).
// Runs as an atomic RPC so concurrent users never race on the counter row.
async function syncCounter(series: string, invoiceNo: string) {
  const m = invoiceNo.match(/(\d{4})-(\d+)\s*$/);
  if (!m) return;
  const seq = parseInt(m[2], 10);
  if (!seq) return;
  await supabase.rpc("sync_invoice_counter", { p_category: series, p_yymm: m[1], p_seq: seq });
}

async function loadClient(id: string): Promise<Client | null> {
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  return (data as Client | null) ?? null;
}

// Callers of this form must sit under <Suspense> (useSearchParams).
export function InvoiceForm({ existing, docType = "invoice" }: { existing?: InvoiceWithItems; docType?: DocType }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEdit = !!existing;
  // Document type is fixed for the life of the form (set by the route, or kept
  // from the record being edited) — it drives the number series and the title.
  const docKind: DocType = existing?.doc_type ?? docType;
  const hasDueDate = docKind === "invoice";

  const { company } = useWorkspace();
  const seriesList = company.series;
  const firstSeries = existing ? findSeries(seriesList, existing.category) : seriesList[0];
  const [category, setCategory] = useState<InvoiceCategory>(existing?.category ?? seriesList[0]?.key ?? "");
  const [clientId, setClientId] = useState<string | null>(existing?.client_id ?? null);
  const [projectId, setProjectId] = useState<string | null>(existing?.project_id ?? null);
  const [billToName, setBillToName] = useState(existing?.bill_to_name ?? "");
  const [billToRegNo, setBillToRegNo] = useState(existing?.bill_to_reg_no ?? "");
  const [billToAddress, setBillToAddress] = useState(existing?.bill_to_address ?? "");
  const [invoiceDate, setInvoiceDate] = useState(existing?.invoice_date ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    existing ? existing.due_date ?? "" : hasDueDate ? defaultDueDate(new Date().toISOString().slice(0, 10)) : ""
  );
  // Once the user (or a schedule prefill) sets the due date, stop re-deriving it.
  const [dueTouched, setDueTouched] = useState(isEdit);
  const [bankName, setBankName] = useState(existing ? existing.bank_name ?? "" : firstSeries?.bankName ?? "");
  const [bankAccount, setBankAccount] = useState(existing ? existing.bank_account ?? "" : firstSeries?.bankAccount ?? "");
  const [specialNotes, setSpecialNotes] = useState(existing ? existing.special_notes ?? "" : firstSeries?.specialNotes ?? "");
  const [salesTaxRate, setSalesTaxRate] = useState(String(existing?.sales_tax_rate ?? 0));
  const [discount, setDiscount] = useState(String(existing?.discount ?? 0));
  const [items, setItems] = useState<DraftItem[]>(
    existing?.invoice_items?.length
      ? existing.invoice_items
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((it) => newItem(it.description, it.line_total != null ? String(it.line_total) : ""))
      : [newItem()]
  );
  const [invoiceNo, setInvoiceNo] = useState<string>(existing?.invoice_no ?? "");
  // Once the user hand-edits the number, stop auto-overwriting it from the preview.
  const [manualNo, setManualNo] = useState<boolean>(isEdit);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [scheduleLabel, setScheduleLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const prefilled = useRef(false);

  // Suggest the next invoice number for the chosen category+month. This is only
  // a suggestion — the field stays editable, and the number is saved as typed.
  useEffect(() => {
    if (manualNo || !category) return;
    const yymm = currentYymm(new Date(invoiceDate));
    const series = seriesPrefix(docKind, category, seriesList);
    supabase
      .from("invoice_counters")
      .select("last_seq")
      .eq("category", series)
      .eq("yymm", yymm)
      .maybeSingle()
      .then(({ data }) => {
        const nextSeq = (data?.last_seq ?? 0) + 1;
        setInvoiceNo(`${series}${yymm}-${String(nextSeq).padStart(2, "0")}`);
      });
  }, [category, invoiceDate, manualNo, docKind, seriesList]);

  // Due date follows the invoice date (+30 days) until the user edits it.
  useEffect(() => {
    if (!hasDueDate || dueTouched) return;
    setDueDate(defaultDueDate(invoiceDate));
  }, [invoiceDate, hasDueDate, dueTouched]);

  // Prefill from ?project= / ?schedule= / ?client= when creating.
  useEffect(() => {
    if (isEdit || prefilled.current) return;
    prefilled.current = true;
    const qProject = searchParams.get("project");
    const qSchedule = searchParams.get("schedule");
    const qClient = searchParams.get("client");
    if (!qProject && !qSchedule && !qClient) return;

    loadDocumentPrefill({ project: qProject, schedule: qSchedule, client: qClient }).then((p) => {
      if (p.error) toast.error(p.error);
      if (p.item) setItems([newItem(p.item.description, p.item.line_total)]);
      if (p.dueDate && hasDueDate) {
        setDueDate(p.dueDate);
        setDueTouched(true);
      }
      if (p.schedule) {
        setScheduleId(p.schedule.id);
        setScheduleLabel(p.schedule.label);
      }
      if (p.project) setProjectId(p.project.id);
      if (p.client) selectClient(p.client);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, searchParams]);

  function applyCategoryDefaults(cat: InvoiceCategory) {
    setCategory(cat);
    const series = findSeries(seriesList, cat);
    if (!isEdit && series) {
      setBankName(series.bankName);
      setBankAccount(series.bankAccount);
      setSpecialNotes(series.specialNotes);
    }
  }

  function selectClient(client: Client | null) {
    setClientId(client?.id ?? null);
    if (client) {
      setBillToName(client.name);
      setBillToRegNo(client.reg_no ?? "");
      setBillToAddress(client.address ?? "");
      if (client.default_category && findSeries(seriesList, client.default_category)) applyCategoryDefaults(client.default_category);
    }
  }

  async function selectProject(project: ProjectWithClient | null) {
    setProjectId(project?.id ?? null);
    // A project with a client and no client chosen yet fills Bill To.
    if (project?.client_id && !clientId) {
      const client = await loadClient(project.client_id);
      if (client) selectClient(client);
    }
  }

  async function addNewClient(name: string) {
    const { data, error } = await supabase
      .from("clients")
      .insert({ name, default_category: category || null })
      .select()
      .single();
    if (!error && data) selectClient(data as Client);
  }

  // A document kept in a series the company no longer lists still shows its own.
  const seriesKeys = [...seriesList.map((s) => s.key), ...(category && !findSeries(seriesList, category) ? [category] : [])];

  const subtotal = items.reduce((sum, it) => sum + (parseFloat(it.line_total) || 0), 0);
  const taxRate = parseFloat(salesTaxRate) || 0;
  const salesTax = (subtotal * taxRate) / 100;
  const total = subtotal + salesTax - (parseFloat(discount) || 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!category) return setErr("This company has no invoice number series yet. Add one in Settings → Company.");
    if (!billToName.trim()) return setErr("Bill To name is required.");
    if (!items.some((it) => it.description.trim())) return setErr("Add at least one line item.");
    setSaving(true);

    const payload = {
      doc_type: docKind,
      category,
      client_id: clientId,
      project_id: projectId,
      bill_to_name: billToName.trim(),
      bill_to_reg_no: billToRegNo.trim() || null,
      bill_to_address: billToAddress.trim() || null,
      invoice_date: invoiceDate,
      due_date: hasDueDate && dueDate ? dueDate : null,
      bank_name: bankName.trim() || null,
      bank_account: bankAccount.trim() || null,
      sales_tax_rate: taxRate,
      discount: parseFloat(discount) || 0,
      special_notes: specialNotes.trim() || null,
    };

    // Auto numbers are reserved atomically at save time (the preview shown in
    // the field is only a hint). Hand-typed numbers are saved as typed.
    const series = seriesPrefix(docKind, category, seriesList);
    let finalNo = invoiceNo.trim();
    if (!isEdit && !manualNo) {
      const { data: reserved, error: rpcErr } = await supabase.rpc("next_invoice_no", {
        p_category: series,
        p_yymm: currentYymm(new Date(invoiceDate)),
      });
      if (rpcErr || !reserved) {
        setSaving(false);
        return setErr(rpcErr?.message ?? "Could not reserve a document number.");
      }
      finalNo = reserved as string;
    }
    if (!finalNo) {
      setSaving(false);
      return setErr(`${DOC_TITLE[docKind]} number is required.`);
    }

    let invoiceId = existing?.id;

    if (isEdit) {
      const { error } = await supabase
        .from("invoices")
        .update({ ...payload, invoice_no: finalNo })
        .eq("id", invoiceId);
      if (error) {
        setSaving(false);
        return setErr(dupMessage(error.message, finalNo));
      }
      await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
    } else {
      const { data: inserted, error } = await supabase
        .from("invoices")
        .insert({ ...payload, invoice_no: finalNo })
        .select()
        .single();
      if (error || !inserted) {
        setSaving(false);
        return setErr(dupMessage(error?.message ?? "Failed to create invoice.", finalNo));
      }
      invoiceId = inserted.id;
      if (scheduleId && invoiceId) {
        const linked = await linkScheduleInvoice(scheduleId, invoiceId);
        if (linked.error) toast.error(`Created, but could not link to the payment schedule: ${linked.error}`);
      }
    }

    // Keep the per-category monthly counter at least as high as this number's
    // sequence, so future auto-suggestions stay ascending and don't collide
    // when the number was entered/skipped manually.
    if (isEdit || manualNo) await syncCounter(series, finalNo);

    const itemRows = items
      .filter((it) => it.description.trim())
      .map((it, i) => ({
        invoice_id: invoiceId,
        description: it.description.trim(),
        line_total: it.line_total.trim() === "" ? null : parseFloat(it.line_total),
        sort_order: i,
      }));
    const { error: itemsError } = await supabase.from("invoice_items").insert(itemRows);
    setSaving(false);
    if (itemsError) return setErr(itemsError.message);

    router.push(`${docBasePath(docKind)}/${invoiceId}`);
  }

  return (
    <form onSubmit={save} className="space-y-6 max-w-3xl">
      {err && <p className="text-red-600 text-sm">{err}</p>}
      {scheduleLabel && (
        <p className="text-xs text-neutral-600 bg-neutral-50 border rounded px-3 py-2">
          This {DOC_TITLE[docKind].toLowerCase()} will be linked to the payment schedule row <span className="font-medium">{scheduleLabel}</span>.
        </p>
      )}

      <div className="bg-white border rounded p-4 space-y-4">
        <div className="flex gap-4 items-center">
          <div className="flex gap-1">
            {seriesKeys.length === 0 && (
              <Link href="/settings/company" className="text-sm text-amber-700 underline">
                Add an invoice number series for this company
              </Link>
            )}
            {seriesKeys.map((c) => (
              <button
                key={c}
                type="button"
                title={findSeries(seriesList, c)?.label}
                onClick={() => applyCategoryDefaults(c)}
                className={`px-3 py-1.5 rounded text-sm ${category === c ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-neutral-500">{DOC_TITLE[docKind]} #</label>
            <input
              className="border rounded px-2 py-1 text-sm font-mono w-36"
              value={invoiceNo}
              onChange={(e) => {
                setManualNo(true);
                setInvoiceNo(e.target.value);
              }}
              placeholder="auto"
            />
            {manualNo && !isEdit && (
              <button
                type="button"
                onClick={() => setManualNo(false)}
                className="text-xs text-neutral-500 hover:underline"
                title="Go back to the auto-suggested next number"
              >
                auto
              </button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-neutral-500">Client</label>
            <ClientPicker value={clientId} onSelect={selectClient} onAddNew={addNewClient} />
          </div>
          <div>
            <label className="text-xs text-neutral-500">Project</label>
            <ProjectPicker value={projectId} onSelect={selectProject} clientId={clientId} placeholder="Link to a project (optional)" />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-neutral-500">{DOC_TITLE[docKind]} Date</label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2 text-sm"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              required
            />
          </div>
          {hasDueDate && (
            <div>
              <label className="text-xs text-neutral-500">Due Date</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2 text-sm"
                value={dueDate}
                onChange={(e) => {
                  setDueTouched(true);
                  setDueDate(e.target.value);
                }}
              />
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-neutral-500">Bill To Name</label>
            <input className="w-full border rounded px-3 py-2 text-sm" value={billToName} onChange={(e) => setBillToName(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs text-neutral-500">Bill To Reg No.</label>
            <input className="w-full border rounded px-3 py-2 text-sm" value={billToRegNo} onChange={(e) => setBillToRegNo(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs text-neutral-500">Bill To Address</label>
          <textarea className="w-full border rounded px-3 py-2 text-sm" rows={2} value={billToAddress} onChange={(e) => setBillToAddress(e.target.value)} />
        </div>
      </div>

      <div className="bg-white border rounded p-4">
        <h2 className="text-sm font-medium mb-3">Line Items</h2>
        <LineItemsEditor items={items} onChange={setItems} />
      </div>

      <div className="bg-white border rounded p-4 grid sm:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500">Bank Name</label>
            <input className="w-full border rounded px-3 py-2 text-sm" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500">Bank Account</label>
            <input className="w-full border rounded px-3 py-2 text-sm" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-neutral-500">Special Notes</label>
            <textarea className="w-full border rounded px-3 py-2 text-sm" rows={3} value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <Row label="Subtotal">RM {formatRM(subtotal)}</Row>
          <div className="flex justify-between items-center py-1">
            <span>Sales Tax Rate</span>
            <input
              type="number"
              step="0.01"
              className="w-24 border rounded px-2 py-1 text-right"
              value={salesTaxRate}
              onChange={(e) => setSalesTaxRate(e.target.value)}
            />
          </div>
          <Row label="Sales Tax">RM {formatRM(salesTax)}</Row>
          <div className="flex justify-between items-center py-1">
            <span>Discount</span>
            <input
              type="number"
              step="0.01"
              className="w-24 border rounded px-2 py-1 text-right"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
          <div className="flex justify-between font-semibold border-t pt-2">
            <span>Total</span>
            <span>RM {formatRM(total)}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button disabled={saving} className="bg-neutral-900 text-white px-4 py-2 rounded text-sm disabled:opacity-50">
          {saving ? "Saving..." : isEdit ? "Save Changes" : `Create ${DOC_TITLE[docKind]}`}
        </button>
        <button type="button" onClick={() => router.back()} className="px-4 py-2 rounded text-sm border">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}
