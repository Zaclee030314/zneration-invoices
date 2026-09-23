"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { apiJson } from "@/lib/api";
import { useWorkspace, memberName } from "@/lib/workspace";
import type { WorkspaceRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Invite {
  id: string;
  email: string;
  role: WorkspaceRole;
  created_at: string;
}

export default function TeamPage() {
  const { workspaceId, workspace, members, isAdmin, userId, refreshMembers } = useWorkspace();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (workspaceId && isAdmin) loadInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, isAdmin]);

  async function loadInvites() {
    const { data } = await supabase
      .from("workspace_invites")
      .select("id, email, role, created_at")
      .eq("workspace_id", workspaceId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    setInvites((data as Invite[]) ?? []);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await apiJson<{ status: "invited" | "added" }>("/api/team/invite", { email: email.trim(), role });
      toast.success(res.status === "added" ? "Existing account added to the workspace." : `Invite sent to ${email.trim()}.`);
      setEmail("");
      await Promise.all([loadInvites(), refreshMembers()]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(uid: string, next: WorkspaceRole) {
    const { error } = await supabase.from("workspace_members").update({ role: next }).eq("workspace_id", workspaceId).eq("user_id", uid);
    if (error) return toast.error(error.message);
    await refreshMembers();
  }

  async function removeMember(uid: string) {
    if (!confirm("Remove this member from the workspace? Their tasks and time entries stay.")) return;
    const { error } = await supabase.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", uid);
    if (error) return toast.error(error.message);
    await refreshMembers();
  }

  async function cancelInvite(id: string) {
    const { error } = await supabase.from("workspace_invites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    loadInvites();
  }

  const admins = members.filter((m) => m.role === "admin").length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-neutral-500">Everyone here shares {workspace?.name ?? "this company"}'s clients, projects, documents, expenses and time entries.</p>
      </div>

      <section className="bg-white border rounded">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b">
            <tr>
              <th className="p-2 text-left">Member</th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Role</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const lastAdmin = m.role === "admin" && admins <= 1;
              return (
                <tr key={m.user_id} className="border-b last:border-0">
                  <td className="p-2 font-medium">
                    {memberName(m)} {m.user_id === userId && <span className="text-xs text-neutral-400">(you)</span>}
                  </td>
                  <td className="p-2 text-neutral-600">{m.profile?.email}</td>
                  <td className="p-2">
                    {isAdmin ? (
                      <select
                        className="border rounded px-2 py-1 text-sm bg-white"
                        value={m.role}
                        disabled={lastAdmin}
                        onChange={(e) => changeRole(m.user_id, e.target.value as WorkspaceRole)}
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    ) : (
                      <Badge variant="secondary" className="capitalize">{m.role}</Badge>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    {isAdmin && !lastAdmin && m.user_id !== userId && (
                      <button onClick={() => removeMember(m.user_id)} className="text-xs text-red-500 hover:underline">Remove</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Invite a teammate</h2>
          <form onSubmit={invite} className="flex flex-wrap gap-2 items-center bg-white border rounded p-3">
            <Input type="email" placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-64" required />
            <select className="border rounded px-2 py-1.5 text-sm bg-white h-9" value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <Button type="submit" disabled={busy}>{busy ? "Sending..." : "Send invite"}</Button>
          </form>
          <p className="text-xs text-neutral-500">
            New people get an email link that lets them set a password. Existing accounts are added immediately.
          </p>

          {invites.length > 0 && (
            <div className="bg-white border rounded">
              <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400 border-b">Pending invites</p>
              <ul className="divide-y">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>
                      {inv.email} <span className="text-neutral-400 capitalize">· {inv.role}</span>
                    </span>
                    <button onClick={() => cancelInvite(inv.id)} className="text-xs text-neutral-500 hover:underline">Cancel</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
