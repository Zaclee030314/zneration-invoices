"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import type { Client, ClientStatus, ProjectWithClient } from "@/lib/types";
import { CLIENT_STATUSES, CLIENT_STATUS_COLOR, KIND_LABEL, STAGE_COLOR, STAGE_LABEL, formatDate } from "@/lib/labels";
import { getClient, updateClient } from "@/lib/queries/clients";
import { listProjects } from "@/lib/queries/projects";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientDialog } from "@/components/crm/ClientDialog";
import { ContactList } from "@/components/crm/ContactList";
import { NotesPanel } from "@/components/crm/NotesPanel";
import { ProjectDialog } from "@/components/projects/ProjectDialog";
import { DocumentList } from "@/components/DocumentList";
import { formatMoney } from "@/components/projects/format";
import { cn } from "@/lib/utils";

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setClient(await getClient(id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(status: ClientStatus) {
    if (!client) return;
    try {
      setClient(await updateClient(client.id, { status }));
      toast.success(`Status set to ${CLIENT_STATUSES.find((s) => s.value === status)?.label}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading...</p>;
  if (!client)
    return (
      <div className="text-sm text-neutral-600">
        <h1 className="text-2xl font-semibold mb-2">Client not found</h1>
        <Link href="/clients" className="underline">Back to clients</Link>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-neutral-500">
            <Link href="/clients" className="hover:underline">Clients</Link> /
          </div>
          <h1 className="text-2xl font-semibold leading-tight">{client.name}</h1>
          <p className="text-sm text-neutral-500">
            {client.reg_no || "No reg. no."}
            {client.industry && ` · ${client.industry}`}
            {client.default_category && ` · ${client.default_category}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={client.status} onValueChange={(v) => setStatus(v as ClientStatus)}>
            <SelectTrigger className={cn("h-8 w-32 text-xs font-medium border-0", CLIENT_STATUS_COLOR[client.status])}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="bg-white border rounded p-4 text-sm">
              <h2 className="text-sm font-medium mb-2">Details</h2>
              <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5 text-neutral-700">
                <Row label="Address">{client.address ? <span className="whitespace-pre-wrap">{client.address}</span> : null}</Row>
                <Row label="Website">
                  {client.website ? (
                    <a href={client.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                      {client.website} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </Row>
                <Row label="Email">{client.email ? <a href={`mailto:${client.email}`} className="hover:underline">{client.email}</a> : null}</Row>
                <Row label="Phone">{client.phone ? <a href={`tel:${client.phone}`} className="hover:underline">{client.phone}</a> : null}</Row>
                <Row label="Industry">{client.industry}</Row>
                <Row label="Source">{client.source}</Row>
                <Row label="Since">{formatDate(client.created_at)}</Row>
              </dl>
              {client.notes && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-neutral-500 mb-1">Notes</p>
                  <p className="whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
            </section>
            <ContactList clientId={client.id} />
          </div>
        </TabsContent>

        <TabsContent value="projects" className="mt-4">
          <ClientProjects clientId={client.id} />
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-8">
          <DocumentList docType="quotation" title="Quotations" basePath="/quotations" newHref="/quotations/new" newLabel="+ New Quotation" clientId={client.id} />
          <DocumentList docType="invoice" title="Invoices" basePath="/invoices" newHref="/invoices/new" newLabel="+ New Invoice" clientId={client.id} />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <NotesPanel clientId={client.id} />
        </TabsContent>
      </Tabs>

      <ClientDialog open={editing} onOpenChange={setEditing} client={client} onSaved={setClient} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd>{children || <span className="text-neutral-300">–</span>}</dd>
    </>
  );
}

function ClientProjects({ clientId }: { clientId: string }) {
  const [projects, setProjects] = useState<ProjectWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setProjects(await listProjects({ clientId, includeArchived: true }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{projects.length} project{projects.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> New project
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-neutral-500">No projects for this client yet.</p>
      ) : (
        <div className="bg-white border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b text-left text-xs text-neutral-500">
              <tr>
                <th className="p-2 font-medium">Code</th>
                <th className="p-2 font-medium">Name</th>
                <th className="p-2 font-medium">Kind</th>
                <th className="p-2 font-medium">Stage</th>
                <th className="p-2 font-medium text-right">Value</th>
                <th className="p-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className={cn("border-b last:border-0 hover:bg-neutral-50", p.archived_at && "opacity-50")}>
                  <td className="p-2 font-mono text-xs"><Link href={`/projects/${p.id}`} className="hover:underline">{p.code}</Link></td>
                  <td className="p-2 font-medium">
                    <Link href={`/projects/${p.id}`} className="hover:underline">{p.name}</Link>
                    {p.archived_at && <span className="ml-2 text-xs text-neutral-400">archived</span>}
                  </td>
                  <td className="p-2 text-neutral-600">{KIND_LABEL[p.kind]}</td>
                  <td className="p-2"><span className={cn("text-xs px-2 py-0.5 rounded font-medium", STAGE_COLOR[p.stage])}>{STAGE_LABEL[p.stage]}</span></td>
                  <td className="p-2 text-right tabular-nums">{formatMoney(p.contract_value, p.currency) || <span className="text-neutral-300">–</span>}</td>
                  <td className="p-2 text-neutral-600">{formatDate(p.due_date) || <span className="text-neutral-300">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ProjectDialog open={creating} onOpenChange={setCreating} project={null} defaultClientId={clientId} onSaved={() => load()} />
    </div>
  );
}
