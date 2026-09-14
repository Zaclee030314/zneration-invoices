"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Pencil, Phone, Plus, Star, Trash2 } from "lucide-react";
import type { Contact } from "@/lib/types";
import { createContact, deleteContact, listContacts, setPrimaryContact, updateContact, type ContactInput } from "@/lib/queries/clients";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const EMPTY: ContactInput = { name: "", role: "", email: "", phone: "", is_primary: false, notes: "" };

export function ContactList({ clientId }: { clientId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ open: boolean; contact: Contact | null }>({ open: false, contact: null });

  const load = useCallback(async () => {
    try {
      setContacts(await listContacts(clientId));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function makePrimary(c: Contact) {
    try {
      await setPrimaryContact(clientId, c.id);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(c: Contact) {
    if (!confirm(`Delete contact ${c.name}?`)) return;
    try {
      await deleteContact(c.id);
      setContacts((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="bg-white border rounded p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Contacts</h2>
        <Button size="sm" variant="outline" onClick={() => setEditing({ open: true, contact: null })}>
          <Plus /> Add
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-neutral-500">No contacts yet.</p>
      ) : (
        <ul className="divide-y">
          {contacts.map((c) => (
            <li key={c.id} className="group py-2 flex items-start gap-3 text-sm">
              <button
                type="button"
                title={c.is_primary ? "Primary contact" : "Make primary"}
                onClick={() => !c.is_primary && makePrimary(c)}
                className={cn("mt-0.5 shrink-0", c.is_primary ? "text-amber-500" : "text-neutral-300 hover:text-amber-400")}
              >
                <Star className="h-4 w-4" fill={c.is_primary ? "currentColor" : "none"} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-medium">
                  {c.name}
                  {c.role && <span className="font-normal text-neutral-500"> · {c.role}</span>}
                </p>
                <div className="flex flex-wrap gap-x-4 text-xs text-neutral-600 mt-0.5">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:underline">
                      <Mail className="h-3 w-3" /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:underline">
                      <Phone className="h-3 w-3" /> {c.phone}
                    </a>
                  )}
                </div>
                {c.notes && <p className="text-xs text-neutral-500 mt-1 whitespace-pre-wrap">{c.notes}</p>}
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                <button type="button" onClick={() => setEditing({ open: true, contact: c })} className="p-1 rounded text-neutral-500 hover:bg-neutral-100" title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => remove(c)} className="p-1 rounded text-neutral-500 hover:bg-neutral-100 hover:text-red-600" title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ContactDialog
        open={editing.open}
        onOpenChange={(open) => setEditing((e) => ({ ...e, open }))}
        clientId={clientId}
        contact={editing.contact}
        onSaved={load}
      />
    </div>
  );
}

function ContactDialog({
  open,
  onOpenChange,
  clientId,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string;
  contact: Contact | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ContactInput>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open)
      setForm(
        contact
          ? { name: contact.name, role: contact.role ?? "", email: contact.email ?? "", phone: contact.phone ?? "", is_primary: contact.is_primary, notes: contact.notes ?? "" }
          : EMPTY
      );
  }, [open, contact]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const saved = contact ? await updateContact(contact.id, form) : await createContact(clientId, form);
      if (form.is_primary) await setPrimaryContact(clientId, saved.id);
      toast.success(contact ? "Contact updated" : "Contact added");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "New contact"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Input value={form.role ?? ""} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Marketing manager" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!form.is_primary} onCheckedChange={(v) => setForm({ ...form, is_primary: !!v })} />
            Primary contact
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
