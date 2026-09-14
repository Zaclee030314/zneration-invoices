"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import type { Client, ClientStatus } from "@/lib/types";
import { CLIENT_STATUSES, CLIENT_STATUS_COLOR, CLIENT_STATUS_LABEL } from "@/lib/labels";
import { deleteClient, invoiceCountsByClient, listClients, projectCountsByClient, type ClientProjectCounts } from "@/lib/queries/clients";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientDialog } from "@/components/crm/ClientDialog";
import { cn } from "@/lib/utils";

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [projectCounts, setProjectCounts] = useState<Record<string, ClientProjectCounts>>({});
  const [invoiceCounts, setInvoiceCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ClientStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; client: Client | null }>({ open: false, client: null });

  const load = useCallback(async () => {
    try {
      const [c, p, i] = await Promise.all([listClients(), projectCountsByClient(), invoiceCountsByClient()]);
      setClients(c);
      setProjectCounts(p);
      setInvoiceCounts(i);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .filter((c) => status === "all" || c.status === status)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.industry ?? "").toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q));
  }, [clients, status, search]);

  async function remove(c: Client) {
    if (!confirm("Delete this client? Existing invoices keep their own copy of the Bill To details.")) return;
    try {
      await deleteClient(c.id);
      setClients((prev) => prev.filter((x) => x.id !== c.id));
      toast.success("Client deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <Button size="sm" onClick={() => setDialog({ open: true, client: null })}>
          <Plus /> New client
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white border rounded p-3">
        <Select value={status} onValueChange={(v) => setStatus(v as ClientStatus | "all")}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {CLIENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-neutral-400" />
          <input className="h-8 w-56 border rounded-md pl-7 pr-2 text-xs" placeholder="Search name, industry, email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="ml-auto text-xs text-neutral-500">{rows.length} of {clients.length}</span>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-500">{clients.length === 0 ? "No clients yet." : "No clients match these filters."}</p>
      ) : (
        <div className="bg-white border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b text-left text-xs text-neutral-500">
              <tr>
                <th className="p-2 font-medium">Name</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 font-medium">Industry</th>
                <th className="p-2 font-medium">Contact</th>
                <th className="p-2 font-medium text-right">Projects</th>
                <th className="p-2 font-medium text-right">Invoices</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const pc = projectCounts[c.id];
                return (
                  <tr key={c.id} onClick={() => router.push(`/clients/${c.id}`)} className="border-b last:border-0 hover:bg-neutral-50 cursor-pointer">
                    <td className="p-2">
                      <p className="font-medium">{c.name}</p>
                      {c.reg_no && <p className="text-xs text-neutral-400">{c.reg_no}</p>}
                    </td>
                    <td className="p-2"><span className={cn("text-xs px-2 py-0.5 rounded font-medium", CLIENT_STATUS_COLOR[c.status])}>{CLIENT_STATUS_LABEL[c.status]}</span></td>
                    <td className="p-2 text-neutral-600">{c.industry || <span className="text-neutral-300">–</span>}</td>
                    <td className="p-2 text-xs text-neutral-600">
                      {c.email && <p>{c.email}</p>}
                      {c.phone && <p>{c.phone}</p>}
                      {!c.email && !c.phone && <span className="text-neutral-300">–</span>}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {pc ? (
                        <>
                          {pc.open}
                          {pc.total !== pc.open && <span className="text-neutral-400"> / {pc.total}</span>}
                        </>
                      ) : (
                        <span className="text-neutral-300">0</span>
                      )}
                    </td>
                    <td className="p-2 text-right tabular-nums">{invoiceCounts[c.id] ?? <span className="text-neutral-300">0</span>}</td>
                    <td className="p-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setDialog({ open: true, client: c })} className="text-xs text-neutral-500 hover:underline mr-3">
                        Edit
                      </button>
                      <button onClick={() => remove(c)} className="text-xs text-red-500 hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ClientDialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} client={dialog.client} onSaved={() => load()} />
    </div>
  );
}
