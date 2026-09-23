"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Client, ClientStatus, InvoiceCategory } from "@/lib/types";
import { CLIENT_STATUSES } from "@/lib/labels";
import { createClient, updateClient, type ClientInput } from "@/lib/queries/clients";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";

interface FormState {
  name: string;
  reg_no: string;
  address: string;
  default_category: InvoiceCategory | null;
  status: ClientStatus;
  industry: string;
  website: string;
  email: string;
  phone: string;
  source: string;
  notes: string;
}

function toForm(c: Client | null): FormState {
  return {
    name: c?.name ?? "",
    reg_no: c?.reg_no ?? "",
    address: c?.address ?? "",
    default_category: c?.default_category ?? null,
    status: c?.status ?? "active",
    industry: c?.industry ?? "",
    website: c?.website ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    source: c?.source ?? "",
    notes: c?.notes ?? "",
  };
}

export function ClientDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  onSaved: (client: Client) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(client));
  const [saving, setSaving] = useState(false);
  const { company } = useWorkspace();
  const seriesKeys = [
    ...company.series.map((s) => s.key),
    ...(form.default_category && !company.series.some((s) => s.key === form.default_category) ? [form.default_category] : []),
  ];

  useEffect(() => {
    if (open) setForm(toForm(client));
  }, [open, client]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const input: ClientInput = { ...form };
      const saved = client ? await updateClient(client.id, input) : await createClient(input);
      toast.success(client ? "Client updated" : "Client created");
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client ? "Edit client" : "New client"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4 text-sm">
          <div className="grid grid-cols-[1fr_160px] gap-3">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus required />
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", v as ClientStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLIENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reg. No.">
              <Input value={form.reg_no} onChange={(e) => set("reg_no", e.target.value)} />
            </Field>
            <Field label="Industry">
              <Input value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder="Events, F&B, Property..." />
            </Field>
          </div>
          <Field label="Address">
            <Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Website">
              <Input type="url" placeholder="https://" value={form.website} onChange={(e) => set("website", e.target.value)} />
            </Field>
            <Field label="Source">
              <Input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="Referral, Instagram, cold outreach..." />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-neutral-500">Default category:</span>
            {seriesKeys.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => set("default_category", form.default_category === c ? null : c)}
                className={cn("px-2 py-1 rounded text-xs", form.default_category === c ? "bg-neutral-900 text-white" : "bg-neutral-100 hover:bg-neutral-200")}
              >
                {c}
              </button>
            ))}
          </div>
          <Field label="Notes">
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth remembering about this client" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving..." : client ? "Save" : "Create client"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
