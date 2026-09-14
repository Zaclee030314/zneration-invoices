"use client";
import Link from "next/link";
import { format } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTimer } from "@/lib/timer";
import { useWorkspace, memberName } from "@/lib/workspace";
import { formatClock, type TimeEntryWithRefs } from "@/lib/queries/time";
import { formatMinutes } from "@/lib/labels";

// Flat list of entries. Running entries show a live clock and cannot be
// edited here (stop them from the sidebar first).
export function TimeEntriesTable({
  entries,
  canEdit,
  onEdit,
  onDelete,
  showDate = false,
  showMember = false,
  showProject = true,
}: {
  entries: TimeEntryWithRefs[];
  canEdit: (entry: TimeEntryWithRefs) => boolean;
  onEdit: (entry: TimeEntryWithRefs) => void;
  onDelete: (entry: TimeEntryWithRefs) => void;
  showDate?: boolean;
  showMember?: boolean;
  showProject?: boolean;
}) {
  const { running, elapsedSec } = useTimer();
  const { members } = useWorkspace();

  if (entries.length === 0) {
    return <p className="text-sm text-neutral-400 px-3 py-2">No entries.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showDate && <TableHead className="w-28">Date</TableHead>}
          {showMember && <TableHead className="w-40">Member</TableHead>}
          {showProject && <TableHead>Project</TableHead>}
          <TableHead>Task / note</TableHead>
          <TableHead className="w-32">Time</TableHead>
          <TableHead className="w-24 text-right">Duration</TableHead>
          <TableHead className="w-20"></TableHead>
          <TableHead className="w-20"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => {
          const isRunning = !e.ended_at;
          const live = isRunning && running?.id === e.id;
          const start = new Date(e.started_at);
          const end = e.ended_at ? new Date(e.ended_at) : null;
          return (
            <TableRow key={e.id} className={isRunning ? "bg-emerald-50/40" : undefined}>
              {showDate && <TableCell className="text-neutral-500 text-xs">{format(start, "EEE d MMM")}</TableCell>}
              {showMember && <TableCell className="text-sm">{memberName(members.find((m) => m.user_id === e.user_id))}</TableCell>}
              {showProject && (
                <TableCell>
                  {e.projects ? (
                    <Link href={`/projects/${e.projects.id}`} className="hover:underline">
                      <span className="font-mono text-xs text-neutral-500 mr-2">{e.projects.code}</span>
                      {e.projects.name}
                    </Link>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </TableCell>
              )}
              <TableCell>
                {e.tasks && <p className="text-sm">{e.tasks.title}</p>}
                {e.note && <p className="text-xs text-neutral-500 whitespace-pre-line">{e.note}</p>}
                {!e.tasks && !e.note && <span className="text-neutral-400">—</span>}
              </TableCell>
              <TableCell className="text-xs text-neutral-500 tabular-nums">
                {format(start, "HH:mm")} – {end ? format(end, "HH:mm") : "…"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {isRunning ? (
                  <span className="font-mono text-emerald-700">{live ? formatClock(elapsedSec) : "running"}</span>
                ) : (
                  formatMinutes(e.duration_min)
                )}
              </TableCell>
              <TableCell>
                {isRunning ? (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200" variant="outline">
                    running
                  </Badge>
                ) : e.billable ? (
                  <Badge variant="outline" className="text-neutral-600">
                    billable
                  </Badge>
                ) : (
                  <span className="text-xs text-neutral-400">non-billable</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {!isRunning && canEdit(e) && (
                  <div className="flex justify-end gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(e)} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-500 hover:text-red-600" onClick={() => onDelete(e)} aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
