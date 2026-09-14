import { supabase } from "@/lib/supabase/client";
import type { Client, Contact, Note, ProjectStage } from "@/lib/types";
import { OPEN_STAGES } from "@/lib/labels";

// Every helper throws on a Supabase error so callers can `try/catch` and toast
// the message. Inserts never set workspace_id: the DB default fills it in.

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

export type ClientInput = Partial<Omit<Client, "id" | "owner_id" | "workspace_id" | "created_at" | "updated_at">> & { name: string };

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase.from("clients").select("*").order("name");
  fail(error);
  return (data as Client[]) ?? [];
}

export async function getClient(id: string): Promise<Client | null> {
  const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  fail(error);
  return (data as Client | null) ?? null;
}

function cleanClient(input: ClientInput) {
  return {
    name: input.name.trim(),
    reg_no: input.reg_no?.trim() || null,
    address: input.address?.trim() || null,
    default_category: input.default_category ?? null,
    status: input.status ?? "active",
    industry: input.industry?.trim() || null,
    website: input.website?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    source: input.source?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

export async function createClient(input: ClientInput): Promise<Client> {
  const { data, error } = await supabase.from("clients").insert(cleanClient(input)).select("*").single();
  fail(error);
  return data as Client;
}

// Minimal insert used by ClientPicker's "Add as new client" path.
export async function createClientByName(name: string): Promise<Client> {
  const { data, error } = await supabase.from("clients").insert({ name: name.trim() }).select("*").single();
  fail(error);
  return data as Client;
}

export async function updateClient(id: string, input: Partial<ClientInput>): Promise<Client> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.reg_no !== undefined) patch.reg_no = input.reg_no?.trim() || null;
  if (input.address !== undefined) patch.address = input.address?.trim() || null;
  if (input.default_category !== undefined) patch.default_category = input.default_category ?? null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.industry !== undefined) patch.industry = input.industry?.trim() || null;
  if (input.website !== undefined) patch.website = input.website?.trim() || null;
  if (input.email !== undefined) patch.email = input.email?.trim() || null;
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.source !== undefined) patch.source = input.source?.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  const { data, error } = await supabase.from("clients").update(patch).eq("id", id).select("*").single();
  fail(error);
  return data as Client;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  fail(error);
}

// { clientId: { total, open } } computed client-side from a slim projects query.
export interface ClientProjectCounts {
  total: number;
  open: number;
}
export async function projectCountsByClient(): Promise<Record<string, ClientProjectCounts>> {
  const { data, error } = await supabase.from("projects").select("client_id, stage").is("archived_at", null);
  fail(error);
  const rows = (data ?? []) as { client_id: string | null; stage: ProjectStage }[];
  const out: Record<string, ClientProjectCounts> = {};
  for (const r of rows) {
    if (!r.client_id) continue;
    const c = (out[r.client_id] ??= { total: 0, open: 0 });
    c.total += 1;
    if (OPEN_STAGES.includes(r.stage)) c.open += 1;
  }
  return out;
}

export async function invoiceCountsByClient(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("invoices").select("client_id").eq("doc_type", "invoice");
  fail(error);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { client_id: string | null }[]) {
    if (r.client_id) out[r.client_id] = (out[r.client_id] ?? 0) + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
export type ContactInput = Pick<Contact, "name"> & Partial<Pick<Contact, "role" | "email" | "phone" | "is_primary" | "notes">>;

export async function listContacts(clientId: string): Promise<Contact[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("client_id", clientId)
    .order("is_primary", { ascending: false })
    .order("name");
  fail(error);
  return (data as Contact[]) ?? [];
}

function cleanContact(input: ContactInput) {
  return {
    name: input.name.trim(),
    role: input.role?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    is_primary: !!input.is_primary,
    notes: input.notes?.trim() || null,
  };
}

export async function createContact(clientId: string, input: ContactInput): Promise<Contact> {
  const { data, error } = await supabase
    .from("contacts")
    .insert({ client_id: clientId, ...cleanContact(input) })
    .select("*")
    .single();
  fail(error);
  return data as Contact;
}

export async function updateContact(id: string, input: ContactInput): Promise<Contact> {
  const { data, error } = await supabase.from("contacts").update(cleanContact(input)).eq("id", id).select("*").single();
  fail(error);
  return data as Contact;
}

// Marks one contact primary and clears the flag on the client's others.
export async function setPrimaryContact(clientId: string, contactId: string): Promise<void> {
  const { error: e1 } = await supabase.from("contacts").update({ is_primary: false }).eq("client_id", clientId).neq("id", contactId);
  fail(e1);
  const { error: e2 } = await supabase.from("contacts").update({ is_primary: true }).eq("id", contactId);
  fail(e2);
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Notes (shared by clients and projects)
// ---------------------------------------------------------------------------
export async function listNotes(scope: { clientId?: string; projectId?: string }): Promise<Note[]> {
  let q = supabase.from("notes").select("*").order("created_at", { ascending: false });
  if (scope.clientId) q = q.eq("client_id", scope.clientId);
  if (scope.projectId) q = q.eq("project_id", scope.projectId);
  const { data, error } = await q;
  fail(error);
  return (data as Note[]) ?? [];
}

export async function addNote(scope: { clientId?: string; projectId?: string }, body: string): Promise<Note> {
  const { data, error } = await supabase
    .from("notes")
    .insert({ client_id: scope.clientId ?? null, project_id: scope.projectId ?? null, body: body.trim() })
    .select("*")
    .single();
  fail(error);
  return data as Note;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  fail(error);
}
