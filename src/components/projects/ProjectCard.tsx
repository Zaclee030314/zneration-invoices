"use client";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import type { ProjectWithClient } from "@/lib/types";
import { HEALTHS, HEALTH_LABEL, KIND_LABEL, formatDate, todayIso } from "@/lib/labels";
import { formatMoney } from "./format";
import { cn } from "@/lib/utils";

const HEALTH_DOT: Record<string, string> = { on_track: "bg-emerald-500", at_risk: "bg-amber-500", blocked: "bg-red-500" };

export function ProjectCard({ project }: { project: ProjectWithClient }) {
  const overdue = !!project.due_date && project.due_date < todayIso() && !["done", "lost", "dormant"].includes(project.stage);
  return (
    <Link
      href={`/projects/${project.id}`}
      draggable={false}
      className="block bg-white border rounded p-2.5 text-sm hover:border-neutral-400 transition-colors select-none"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[11px] text-neutral-500">{project.code}</span>
        <span
          className={cn("mt-1 h-2 w-2 rounded-full shrink-0", HEALTH_DOT[project.health])}
          title={HEALTH_LABEL[project.health] ?? HEALTHS[0].label}
        />
      </div>
      <p className="font-medium leading-snug mt-0.5 break-words">{project.name}</p>
      <p className="text-xs text-neutral-500 truncate">{project.clients?.name ?? "No client"} · {KIND_LABEL[project.kind]}</p>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="text-neutral-700 font-medium">{formatMoney(project.contract_value, project.currency)}</span>
        {project.due_date && (
          <span className={cn("inline-flex items-center gap-1", overdue ? "text-red-600 font-medium" : "text-neutral-500")}>
            <CalendarDays className="h-3 w-3" /> {formatDate(project.due_date)}
          </span>
        )}
      </div>
    </Link>
  );
}
