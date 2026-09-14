"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Priority, ProjectHealth, ProjectKind, ProjectStage, ProjectWithClient } from "@/lib/types";
import { HEALTHS, PRIORITIES, PROJECT_KINDS, PROJECT_STAGES } from "@/lib/labels";
import { memberName, useWorkspace } from "@/lib/workspace";
import { createProject, ensureUniqueCode, suggestCode, updateProject, type ProjectInput } from "@/lib/queries/projects";
import { createClientByName } from "@/lib/queries/clients";
import { ClientPicker } from "@/components/ClientPicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";

interface FormState {
  name: string;
  code: string;
  client_id: string | null;
  kind: ProjectKind;
  stage: ProjectStage;
  priority: Priority;
  health: ProjectHealth;
  contract_value: string;
  currency: string;
  start_date: string;
  due_date: string;
  lead_user_id: string;
  url: string;
  description: string;
}

function toForm(p: ProjectWithClient | null, defaultClientId?: string | null): FormState {
  return {
    name: p?.name ?? "",
    code: p?.code ?? "",
    client_id: p?.client_id ?? defaultClientId ?? null,
    kind: p?.kind ?? "software",
    stage: p?.stage ?? "lead",
    priority: p?.priority ?? "medium",
    health: p?.health ?? "on_track",
    contract_value: p?.contract_value != null ? String(p.contract_value) : "",
    currency: p?.currency ?? "MYR",
    start_date: p?.start_date ?? "",
    due_date: p?.due_date ?? "",
    lead_user_id: p?.lead_user_id ?? NONE,
    url: p?.url ?? "",
    description: p?.description ?? "",
  };
}

function toInput(f: FormState): ProjectInput {
  return {
    name: f.name,
    code: f.code,
    client_id: f.client_id,
    kind: f.kind,
    stage: f.stage,
    priority: f.priority,
    health: f.health,
    contract_value: f.contract_value.trim() ? Number(f.contract_value) : null,
    currency: f.currency.trim().toUpperCase() || "MYR",
    start_date: f.start_date || null,
    due_date: f.due_date || null,
    lead_user_id: f.lead_user_id === NONE ? null : f.lead_user_id,
    url: f.url,
    description: f.description,
  };
}

// Create (project=null) or edit a project. The code is suggested from the name
// until the user edits it by hand.
export function ProjectDialog({
  open,
  onOpenChange,
  project,
  defaultClientId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectWithClient | null;
  defaultClientId?: string | null;
  onSaved: (project: ProjectWithClient) => void;
}) {
  const { members } = useWorkspace();
  const [form, setForm] = useState<FormState>(() => toForm(project, defaultClientId));
  const [codeTouched, setCodeTouched] = useState(!!project);
  const [saving, setSaving] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setForm(toForm(project, defaultClientId));
    setCodeTouched(!!project);
    setPickerKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  function onNameChange(name: string) {
    setForm((f) => ({ ...f, name, code: codeTouched ? f.code : suggestCode(name) }));
  }

  async function addClient(name: string) {
    try {
      const c = await createClientByName(name);
      set("client_id", c.id);
      setPickerKey((k) => k + 1);
      toast.success(`Client "${c.name}" created`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const input = toInput(form);
      if (!input.code.trim()) input.code = suggestCode(input.name) || "PRJ";
      input.code = await ensureUniqueCode(input.code, project?.id);
      const saved = project ? await updateProject(project.id, input) : await createProject(input);
      toast.success(project ? "Project updated" : `Project ${saved.code} created`);
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
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4 text-sm">
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => onNameChange(e.target.value)} autoFocus required />
            </Field>
            <Field label="Code">
              <Input
                value={form.code}
                onChange={(e) => {
                  setCodeTouched(true);
                  set("code", e.target.value.toUpperCase());
                }}
                className="font-mono uppercase"
                placeholder="AUTO"
              />
            </Field>
          </div>
          <Field label="Client">
            <ClientPicker key={pickerKey} value={form.client_id} onSelect={(c) => set("client_id", c?.id ?? null)} onAddNew={addClient} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kind">
              <EnumSelect value={form.kind} onChange={(v) => set("kind", v as ProjectKind)} options={PROJECT_KINDS} />
            </Field>
            <Field label="Stage">
              <EnumSelect value={form.stage} onChange={(v) => set("stage", v as ProjectStage)} options={PROJECT_STAGES} />
            </Field>
            <Field label="Priority">
              <EnumSelect value={form.priority} onChange={(v) => set("priority", v as Priority)} options={PRIORITIES} />
            </Field>
            <Field label="Health">
              <EnumSelect value={form.health} onChange={(v) => set("health", v as ProjectHealth)} options={HEALTHS} />
            </Field>
            <Field label="Contract value">
              <Input type="number" min={0} step="0.01" value={form.contract_value} onChange={(e) => set("contract_value", e.target.value)} />
            </Field>
            <Field label="Currency">
              <Input value={form.currency} onChange={(e) => set("currency", e.target.value)} maxLength={3} className="uppercase" />
            </Field>
            <Field label="Start date">
              <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
            </Field>
            <Field label="Due date">
              <Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
            </Field>
            <Field label="Lead">
              <Select value={form.lead_user_id} onValueChange={(v) => set("lead_user_id", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No lead</SelectItem>
                  {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{memberName(m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="URL">
            <Input type="url" placeholder="https://" value={form.url} onChange={(e) => set("url", e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving..." : project ? "Save" : "Create project"}</Button>
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

function EnumSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
