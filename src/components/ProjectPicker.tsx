"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ProjectWithClient } from "@/lib/types";
import { STAGE_LABEL } from "@/lib/labels";

// Searchable project dropdown (same feel as ClientPicker). When clientId is
// given, that client's projects are listed first and the rest are dimmed.
export function ProjectPicker({
  value,
  onSelect,
  clientId,
  placeholder = "Search projects",
  allowClear = true,
}: {
  value: string | null;
  onSelect: (project: ProjectWithClient | null) => void;
  clientId?: string | null;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const [projects, setProjects] = useState<ProjectWithClient[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("projects")
      .select("*, clients(id, name)")
      .is("archived_at", null)
      .order("name")
      .then(({ data }) => setProjects((data as ProjectWithClient[]) ?? []));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.clients?.name ?? "").toLowerCase().includes(q)
    );
    if (!clientId) return list;
    return [...list.filter((p) => p.client_id === clientId), ...list.filter((p) => p.client_id !== clientId)];
  }, [projects, query, clientId]);

  const selected = projects.find((p) => p.id === value);

  return (
    <div className="relative">
      <input
        className="w-full border rounded px-3 py-2 text-sm"
        placeholder={placeholder}
        value={open ? query : selected ? `${selected.code} · ${selected.name}` : query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="absolute z-20 w-full bg-white border rounded mt-1 max-h-64 overflow-auto shadow-lg">
          {allowClear && value && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50 border-b"
              onMouseDown={() => {
                onSelect(null);
                setQuery("");
                setOpen(false);
              }}
            >
              No project
            </button>
          )}
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-neutral-400">No projects</p>}
          {filtered.map((p) => {
            const other = !!clientId && p.client_id !== clientId;
            return (
              <button
                key={p.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 ${other ? "text-neutral-400" : ""}`}
                onMouseDown={() => {
                  onSelect(p);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="font-mono text-xs mr-2">{p.code}</span>
                {p.name}
                <span className="ml-2 text-xs text-neutral-400">
                  {p.clients?.name ? `${p.clients.name} · ` : ""}
                  {STAGE_LABEL[p.stage]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
