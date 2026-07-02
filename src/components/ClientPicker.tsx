"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Client } from "@/lib/types";

export function ClientPicker({
  value,
  onSelect,
  onAddNew,
}: {
  value: string | null;
  onSelect: (client: Client | null) => void;
  onAddNew: (name: string) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.from("clients").select("*").order("name").then(({ data }) => setClients((data as Client[]) ?? []));
  }, []);

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  const selected = clients.find((c) => c.id === value);

  return (
    <div className="relative">
      <input
        className="w-full border rounded px-3 py-2 text-sm"
        placeholder="Search or type a new client name"
        value={open ? query : selected?.name ?? query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="absolute z-10 w-full bg-white border rounded mt-1 max-h-56 overflow-auto shadow-lg">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50"
              onMouseDown={() => {
                onSelect(c);
                setQuery("");
                setOpen(false);
              }}
            >
              {c.name}
            </button>
          ))}
          {query.trim() && !filtered.some((c) => c.name.toLowerCase() === query.trim().toLowerCase()) && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 border-t"
              onMouseDown={() => {
                onAddNew(query.trim());
                setQuery("");
                setOpen(false);
              }}
            >
              + Add &quot;{query.trim()}&quot; as new client
            </button>
          )}
        </div>
      )}
    </div>
  );
}
