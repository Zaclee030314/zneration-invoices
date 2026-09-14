"use client";
import { useState } from "react";
import { FolderKanban, Plus, Tag, X } from "lucide-react";
import type { BankTag, Project } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type PickerProject = Pick<Project, "id" | "code" | "name" | "kind">;
export type LinkValue = { project_id: string | null; tag: string | null };

// Links a payment to a project/event or to a free-text tag (never both).
export function TagProjectPicker({
  projectId,
  tag,
  projects,
  tags,
  onChange,
  placeholder = "Add event or tag",
  clearable,
  className,
}: {
  projectId: string | null;
  tag: string | null;
  projects: PickerProject[];
  tags: BankTag[];
  onChange: (value: LinkValue) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const project = projects.find((p) => p.id === projectId);
  const label = project ? `${project.code} · ${project.name}` : tag;
  const typed = query.trim();
  const tagExists = tags.some((t) => t.tag.toLowerCase() === typed.toLowerCase());
  const ordered = [...projects].sort((a, b) => Number(b.kind === "event") - Number(a.kind === "event") || a.name.localeCompare(b.name));

  function pick(value: LinkValue) {
    onChange(value);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded border px-2 py-1 text-xs text-left hover:bg-neutral-50",
            !label && "border-dashed text-neutral-400",
            className
          )}
        >
          {project ? <FolderKanban className="size-3 shrink-0" /> : tag ? <Tag className="size-3 shrink-0" /> : null}
          <span className="truncate">{label || placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search events or type a new tag" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {typed && !tagExists && (
              <CommandGroup>
                <CommandItem value={`new-tag ${typed}`} onSelect={() => pick({ project_id: null, tag: typed })}>
                  <Plus /> Use &ldquo;{typed}&rdquo; as a new tag
                </CommandItem>
              </CommandGroup>
            )}
            {(clearable ?? Boolean(projectId || tag)) && !typed && (
              <CommandGroup>
                <CommandItem value="clear-link" onSelect={() => pick({ project_id: null, tag: null })}>
                  <X /> No event or tag
                </CommandItem>
              </CommandGroup>
            )}
            {ordered.length > 0 && (
              <CommandGroup heading="Projects and events">
                {ordered.map((p) => (
                  <CommandItem key={p.id} value={`project ${p.code} ${p.name} ${p.id}`} onSelect={() => pick({ project_id: p.id, tag: null })}>
                    <FolderKanban />
                    <span className="truncate">
                      {p.code} · {p.name}
                    </span>
                    {p.kind === "event" && <span className="ml-auto text-[10px] text-neutral-400">Event</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {tags.length > 0 && (
              <CommandGroup heading="Tags">
                {tags.map((t) => (
                  <CommandItem key={t.tag} value={`tag ${t.tag}`} onSelect={() => pick({ project_id: null, tag: t.tag })}>
                    <Tag />
                    <span className="truncate">{t.tag}</span>
                    <span className="ml-auto text-[10px] text-neutral-400">{t.use_count}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
