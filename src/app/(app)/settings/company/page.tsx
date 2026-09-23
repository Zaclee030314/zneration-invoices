"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CompanyForm, draftFromProfile, draftProblem, emptySeries, profileFromDraft, type CompanyDraft, type SeriesDraft,
} from "@/components/settings/CompanyForm";

export default function CompanySettingsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading...</p>}>
      <CompanySettings />
    </Suspense>
  );
}

function CompanySettings() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspace, workspaceId, company, companies, isAdmin, refreshCompanies, switchCompany } = useWorkspace();
  const [draft, setDraft] = useState<CompanyDraft>(() => draftFromProfile(workspace?.name ?? "", company));
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const canAdd = companies.some((c) => c.role === "admin");

  useEffect(() => {
    setDraft(draftFromProfile(workspace?.name ?? "", company));
    // Reset only when another company becomes active, not on every provider render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (searchParams.get("new") === "1" && canAdd) setAdding(true);
  }, [searchParams, canAdd]);

  async function save() {
    const problem = draftProblem(draft);
    if (problem) return toast.error(problem);
    setSaving(true);
    const { error } = await supabase
      .from("workspaces")
      .update({ name: draft.displayName.trim(), profile: profileFromDraft(draft) })
      .eq("id", workspaceId);
    setSaving(false);
    if (error) {
      return toast.error(/profile/.test(error.message) ? "Run supabase/migrations/011_companies.sql first." : error.message);
    }
    await refreshCompanies();
    setDraft((d) => ({ ...d, series: d.series.map((s) => ({ ...s, saved: true })) }));
    toast.success("Company details saved.");
  }

  async function removeSeries(s: SeriesDraft) {
    if (s.saved) {
      const { count, error } = await supabase.from("invoices").select("id", { count: "exact", head: true }).eq("category", s.key);
      if (error) return toast.error(error.message);
      if (count) return toast.error(`${count} document(s) use ${s.key}, so it can't be removed. You can still change its name.`);
    }
    setDraft((d) => ({ ...d, series: d.series.filter((x) => x.rowId !== s.rowId) }));
  }

  function closeAdd(open: boolean) {
    setAdding(open);
    if (!open && searchParams.get("new")) router.replace("/settings/company");
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Company</h1>
          <p className="text-sm text-neutral-500">
            The letterhead and invoice numbers used on {workspace?.name ?? "this company"}&apos;s documents. Switch company at the top of the sidebar.
          </p>
        </div>
        {canAdd && (
          <Button type="button" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Add a company
          </Button>
        )}
      </div>

      <CompanyForm draft={draft} onChange={setDraft} readOnly={!isAdmin} onRemoveSeries={removeSeries} />

      {isAdmin ? (
        <div className="flex gap-2">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setDraft(draftFromProfile(workspace?.name ?? "", company))} disabled={saving}>
            Undo changes
          </Button>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Only admins can change these details.</p>
      )}

      <AddCompanyDialog open={adding} onOpenChange={closeAdd} onCreated={switchCompany} />
    </div>
  );
}

function AddCompanyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (workspaceId: string) => Promise<string | null>;
}) {
  const { company } = useWorkspace();
  const blank = (): CompanyDraft => ({
    displayName: "",
    company: { name: "", regNo: "", address: company.company.address, tel: company.company.tel, email: company.company.email, contact: company.company.contact },
    series: [emptySeries()],
  });
  const [draft, setDraft] = useState<CompanyDraft>(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function create() {
    const problem = draftProblem(draft);
    if (problem) return toast.error(problem);
    setSaving(true);
    const { data, error } = await supabase.rpc("create_workspace", { p_name: draft.displayName.trim(), p_profile: profileFromDraft(draft) });
    if (error || !data) {
      setSaving(false);
      return toast.error(/create_workspace/.test(error?.message ?? "") ? "Run supabase/migrations/011_companies.sql first." : error?.message ?? "Could not add the company.");
    }
    toast.success(`${draft.displayName.trim()} added. Switching to it...`);
    const switchError = await onCreated(data as string);
    if (switchError) {
      setSaving(false);
      toast.error(switchError);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add a company</DialogTitle>
          <DialogDescription>
            A separate company with its own invoices, receipts, quotations, clients, projects, expenses and bank statements. You become its admin; invite
            others from Settings → Team once you are in it. Contact details are copied from the current company, so change them if they differ.
          </DialogDescription>
        </DialogHeader>
        <CompanyForm draft={draft} onChange={setDraft} onRemoveSeries={(s) => setDraft((d) => ({ ...d, series: d.series.filter((x) => x.rowId !== s.rowId) }))} />
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={create} disabled={saving}>
            {saving ? "Adding..." : "Add company"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
