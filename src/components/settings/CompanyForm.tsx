"use client";
import { Plus, Trash2 } from "lucide-react";
import {
  SERIES_COLORS, SERIES_KEY_RE, derivedPrefix,
  type CompanyDetails, type CompanyProfile, type InvoiceSeries, type SeriesColor,
} from "@/lib/company";
import { SERIES_COLOR_CLASS } from "@/components/CategoryBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// `saved` marks a series already in use: its codes are fixed because documents carry them.
export type SeriesDraft = InvoiceSeries & { rowId: string; saved: boolean };

export interface CompanyDraft {
  displayName: string;
  company: CompanyDetails;
  series: SeriesDraft[];
}

export function draftFromProfile(displayName: string, profile: CompanyProfile): CompanyDraft {
  return {
    displayName,
    company: { ...profile.company },
    series: profile.series.map((s) => ({ ...s, rowId: crypto.randomUUID(), saved: true })),
  };
}

export function emptySeries(): SeriesDraft {
  return {
    rowId: crypto.randomUUID(),
    saved: false,
    key: "",
    label: "Invoice",
    receiptPrefix: "",
    quotationPrefix: "",
    bankName: "",
    bankAccount: "",
    specialNotes: "",
    color: "violet",
  };
}

export function profileFromDraft(d: CompanyDraft): CompanyProfile {
  return {
    company: Object.fromEntries(Object.entries(d.company).map(([k, v]) => [k, v.trim()])) as unknown as CompanyDetails,
    series: d.series.map((s) => {
      const key = s.key.trim().toUpperCase();
      return {
        key,
        label: s.label.trim() || key,
        receiptPrefix: s.receiptPrefix.trim().toUpperCase() || derivedPrefix(key, "RC"),
        quotationPrefix: s.quotationPrefix.trim().toUpperCase() || derivedPrefix(key, "QT"),
        bankName: s.bankName.trim(),
        bankAccount: s.bankAccount.trim(),
        specialNotes: s.specialNotes.trim(),
        color: s.color,
      };
    }),
  };
}

// Every invoice, receipt and quotation code must be unique within the company,
// or two kinds of document would share one number sequence.
export function draftProblem(d: CompanyDraft): string | null {
  if (!d.displayName.trim()) return "Give the company a short name for the switcher.";
  if (!d.company.name.trim()) return "The registered company name is required; it is printed on every document.";
  if (!d.series.length) return "Add at least one invoice series.";
  const codes = new Set<string>();
  for (const s of profileFromDraft(d).series) {
    for (const code of [s.key, s.receiptPrefix, s.quotationPrefix]) {
      if (!SERIES_KEY_RE.test(code)) return `"${code || "(blank)"}" is not a valid code: use 2 to 8 capital letters or digits, starting with a letter.`;
      if (codes.has(code)) return `The code ${code} is used twice. Invoice, receipt and quotation codes must all be different.`;
      codes.add(code);
    }
  }
  return null;
}

export function CompanyForm({
  draft,
  onChange,
  readOnly,
  onRemoveSeries,
}: {
  draft: CompanyDraft;
  onChange: (d: CompanyDraft) => void;
  readOnly?: boolean;
  onRemoveSeries?: (s: SeriesDraft) => void;
}) {
  const setCompany = (k: keyof CompanyDetails, v: string) => onChange({ ...draft, company: { ...draft.company, [k]: v } });
  const setSeries = (rowId: string, patch: Partial<SeriesDraft>) =>
    onChange({ ...draft, series: draft.series.map((s) => (s.rowId === rowId ? { ...s, ...patch } : s)) });

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded border bg-white p-4">
        <h2 className="text-sm font-medium">Company</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Short name (shown in the company switcher)">
            <Input value={draft.displayName} disabled={readOnly} onChange={(e) => onChange({ ...draft, displayName: e.target.value })} placeholder="Purezen" />
          </Field>
          <Field label="Registered name (printed on documents)">
            <Input value={draft.company.name} disabled={readOnly} onChange={(e) => setCompany("name", e.target.value)} placeholder="PurezenM Wellness Sdn Bhd" />
          </Field>
          <Field label="Registration no.">
            <Input value={draft.company.regNo} disabled={readOnly} onChange={(e) => setCompany("regNo", e.target.value)} placeholder="202401012345 (1234567-X)" />
          </Field>
          <Field label="Contact person">
            <Input value={draft.company.contact} disabled={readOnly} onChange={(e) => setCompany("contact", e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={draft.company.tel} disabled={readOnly} onChange={(e) => setCompany("tel", e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={draft.company.email} disabled={readOnly} onChange={(e) => setCompany("email", e.target.value)} />
          </Field>
        </div>
        <Field label="Address">
          <Textarea rows={2} value={draft.company.address} disabled={readOnly} onChange={(e) => setCompany("address", e.target.value)} />
        </Field>
      </section>

      <section className="space-y-3 rounded border bg-white p-4">
        <div>
          <h2 className="text-sm font-medium">Invoice number series</h2>
          <p className="text-xs text-neutral-500">
            Each series numbers its invoices as CODE + YYMM + running number, for example PZIV2609-01. Receipts and quotations made from it use their
            own codes. The bank details and notes fill in new documents.
          </p>
        </div>
        {draft.series.map((s) => (
          <div key={s.rowId} className="space-y-3 rounded border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Invoice code" className="w-28">
                <Input
                  value={s.key}
                  disabled={readOnly || s.saved}
                  onChange={(e) => setSeries(s.rowId, { key: e.target.value.toUpperCase() })}
                  placeholder="PZIV"
                  className="font-mono"
                />
              </Field>
              <Field label="Receipt code" className="w-28">
                <Input
                  value={s.receiptPrefix}
                  disabled={readOnly || s.saved}
                  onChange={(e) => setSeries(s.rowId, { receiptPrefix: e.target.value.toUpperCase() })}
                  placeholder={s.key ? derivedPrefix(s.key, "RC") : "PZRC"}
                  className="font-mono"
                />
              </Field>
              <Field label="Quotation code" className="w-28">
                <Input
                  value={s.quotationPrefix}
                  disabled={readOnly || s.saved}
                  onChange={(e) => setSeries(s.rowId, { quotationPrefix: e.target.value.toUpperCase() })}
                  placeholder={s.key ? derivedPrefix(s.key, "QT") : "PZQT"}
                  className="font-mono"
                />
              </Field>
              <Field label="Name" className="min-w-[10rem] flex-1">
                <Input value={s.label} disabled={readOnly} onChange={(e) => setSeries(s.rowId, { label: e.target.value })} />
              </Field>
              <Field label="Colour">
                <div className="flex h-9 items-center gap-1">
                  {SERIES_COLORS.map((c: SeriesColor) => (
                    <button
                      key={c}
                      type="button"
                      disabled={readOnly}
                      title={c}
                      onClick={() => setSeries(s.rowId, { color: c })}
                      className={cn("h-5 w-5 rounded-full border", SERIES_COLOR_CLASS[c], s.color === c && "ring-2 ring-neutral-900 ring-offset-1")}
                    />
                  ))}
                </div>
              </Field>
              {!readOnly && onRemoveSeries && (
                <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => onRemoveSeries(s)} aria-label="Remove series">
                  <Trash2 />
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[10rem_12rem_1fr]">
              <Field label="Bank">
                <Input value={s.bankName} disabled={readOnly} onChange={(e) => setSeries(s.rowId, { bankName: e.target.value })} placeholder="PBB" />
              </Field>
              <Field label="Account no.">
                <Input value={s.bankAccount} disabled={readOnly} onChange={(e) => setSeries(s.rowId, { bankAccount: e.target.value })} />
              </Field>
              <Field label="Default notes">
                <Input value={s.specialNotes} disabled={readOnly} onChange={(e) => setSeries(s.rowId, { specialNotes: e.target.value })} />
              </Field>
            </div>
            {s.saved && !readOnly && <p className="text-xs text-neutral-400">Codes are fixed once saved, because documents already use them.</p>}
          </div>
        ))}
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...draft, series: [...draft.series, emptySeries()] })}>
            <Plus /> Add a series
          </Button>
        )}
      </section>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-neutral-500">{label}</Label>
      {children}
    </div>
  );
}
