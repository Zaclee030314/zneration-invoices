"use client";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase/client";
import type { Client, InvoiceCategory } from "@/lib/types";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Client> | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("clients").select("*").order("name");
    setClients((data as Client[]) ?? []);
    setLoading(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing?.name?.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (editing.id) {
      await supabase
        .from("clients")
        .update({
          name: editing.name,
          reg_no: editing.reg_no || null,
          address: editing.address || null,
          default_category: editing.default_category || null,
        })
        .eq("id", editing.id);
    } else {
      await supabase.from("clients").insert({
        owner_id: user.id,
        name: editing.name,
        reg_no: editing.reg_no || null,
        address: editing.address || null,
        default_category: editing.default_category || null,
      });
    }
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this client? Existing invoices keep their own copy of the Bill To details.")) return;
    await supabase.from("clients").delete().eq("id", id);
    load();
  }

  return (
    <AuthGuard>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <button onClick={() => setEditing({})} className="bg-neutral-900 text-white px-4 py-2 rounded text-sm">
          + New Client
        </button>
      </div>

      {editing && (
        <form onSubmit={save} className="bg-white border rounded p-4 mb-6 space-y-3 max-w-xl">
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Name"
            value={editing.name ?? ""}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            required
          />
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Reg. No."
            value={editing.reg_no ?? ""}
            onChange={(e) => setEditing({ ...editing, reg_no: e.target.value })}
          />
          <textarea
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Address"
            rows={2}
            value={editing.address ?? ""}
            onChange={(e) => setEditing({ ...editing, address: e.target.value })}
          />
          <div className="flex gap-2 items-center">
            <span className="text-sm text-neutral-500">Default category:</span>
            {(["EVIV", "ZMIV"] as const).map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setEditing({ ...editing, default_category: c as InvoiceCategory })}
                className={`px-2 py-1 rounded text-xs ${editing.default_category === c ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="bg-neutral-900 text-white px-4 py-2 rounded text-sm">Save</button>
            <button type="button" onClick={() => setEditing(null)} className="border px-4 py-2 rounded text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : clients.length === 0 ? (
        <p className="text-sm text-neutral-500">No clients yet.</p>
      ) : (
        <table className="w-full text-sm bg-white border rounded overflow-hidden">
          <thead className="bg-neutral-50 border-b">
            <tr>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">Reg. No.</th>
              <th className="p-2 text-left">Category</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="p-2 font-medium">{c.name}</td>
                <td className="p-2">{c.reg_no}</td>
                <td className="p-2">{c.default_category}</td>
                <td className="p-2 text-right whitespace-nowrap">
                  <button onClick={() => setEditing(c)} className="text-xs text-neutral-500 hover:underline mr-3">
                    Edit
                  </button>
                  <button onClick={() => remove(c.id)} className="text-xs text-red-500 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AuthGuard>
  );
}
