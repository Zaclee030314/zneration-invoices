"use client";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CHANNEL_COLOR, CHANNEL_LABEL, CONTENT_STATUSES, CONTENT_STATUS_DOT, FORMAT_LABEL } from "@/lib/labels";
import { memberName, type Member } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type { ContentStatus } from "@/lib/types";
import type { ContentItemWithRefs } from "@/lib/queries/content";

// Table view of the visible month, sorted by due date, with inline status.
export function ContentList({
  items,
  members,
  showProject = true,
  onSelectItem,
  onStatusChange,
}: {
  items: ContentItemWithRefs[];
  members: Member[];
  showProject?: boolean;
  onSelectItem: (item: ContentItemWithRefs) => void;
  onStatusChange: (item: ContentItemWithRefs, status: ContentStatus) => void;
}) {
  if (items.length === 0) {
    return <div className="bg-white border rounded p-6 text-center text-sm text-neutral-500">No content items in this month.</div>;
  }
  const sorted = items.slice().sort((a, b) => a.due_date.localeCompare(b.due_date) || (a.publish_at ?? "").localeCompare(b.publish_at ?? ""));
  return (
    <div className="bg-white border rounded overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Date</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-32">Channel</TableHead>
            <TableHead className="w-24">Format</TableHead>
            <TableHead className="w-40">Status</TableHead>
            {showProject && <TableHead className="w-48">Project</TableHead>}
            <TableHead className="w-40">Assignee</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((it) => (
            <TableRow key={it.id} className="cursor-pointer" onClick={() => onSelectItem(it)}>
              <TableCell className="text-xs text-neutral-500 whitespace-nowrap">
                {format(parseISO(it.due_date), "EEE d MMM")}
                {it.publish_at && <span className="block text-[11px] text-neutral-400">{format(new Date(it.publish_at), "HH:mm")}</span>}
              </TableCell>
              <TableCell>
                <p className={cn("text-sm", it.status === "cancelled" && "line-through text-neutral-400")}>{it.title}</p>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("font-normal", CHANNEL_COLOR[it.channel])}>
                  {CHANNEL_LABEL[it.channel]}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-neutral-600">{FORMAT_LABEL[it.format]}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Select value={it.status} onValueChange={(v) => onStatusChange(it, v as ContentStatus)}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className="inline-flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", CONTENT_STATUS_DOT[s.value])} />
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              {showProject && (
                <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                  {it.projects ? (
                    <Link href={`/projects/${it.projects.id}`} className="hover:underline">
                      <span className="font-mono text-xs text-neutral-500 mr-1.5">{it.projects.code}</span>
                      {it.projects.name}
                    </Link>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </TableCell>
              )}
              <TableCell className="text-sm text-neutral-600">
                {it.assignee_id ? memberName(members.find((m) => m.user_id === it.assignee_id)) : <span className="text-neutral-400">—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
