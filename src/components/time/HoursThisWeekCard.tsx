"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { ArrowRight } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { useTimer } from "@/lib/timer";
import { listTimeEntries } from "@/lib/queries/time";
import { formatMinutes } from "@/lib/labels";

// Dashboard card: my logged minutes this ISO week (Mon–Sun) plus whatever the
// running timer has accumulated, with a tiny per-day bar chart.
export function HoursThisWeekCard() {
  const { userId } = useWorkspace();
  const { running, elapsedSec, version } = useTimer();
  const [perDay, setPerDay] = useState<number[] | null>(null);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const from = startOfWeek(new Date(), { weekStartsOn: 1 });
    listTimeEntries({ from, to: addDays(from, 7), userId })
      .then((rows) => {
        if (cancelled) return;
        const days = [0, 0, 0, 0, 0, 0, 0];
        for (const r of rows) {
          if (!r.ended_at) continue; // running entry is added live below
          const idx = Math.floor((new Date(r.started_at).getTime() - from.getTime()) / 86_400_000);
          if (idx >= 0 && idx < 7) days[idx] += r.duration_min ?? 0;
        }
        setPerDay(days);
      })
      .catch(() => setPerDay([0, 0, 0, 0, 0, 0, 0]));
    return () => {
      cancelled = true;
    };
  }, [userId, version]);

  const days = (perDay ?? [0, 0, 0, 0, 0, 0, 0]).slice();
  if (running && perDay) {
    const idx = Math.floor((new Date(running.started_at).getTime() - weekStart.getTime()) / 86_400_000);
    if (idx >= 0 && idx < 7) days[idx] += Math.floor(elapsedSec / 60);
  }
  const total = days.reduce((a, b) => a + b, 0);
  const max = Math.max(60, ...days);

  return (
    <div className="bg-white border rounded p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Hours this week</p>
          {perDay === null ? (
            <p className="text-2xl font-semibold mt-1 text-neutral-300">…</p>
          ) : (
            <p className="text-2xl font-semibold mt-1">{formatMinutes(total)}</p>
          )}
          {running && (
            <p className="text-xs text-emerald-700 mt-0.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1 align-middle" />
              Timer running{running.projects ? ` · ${running.projects.code}` : ""}
            </p>
          )}
        </div>
        <Link href="/time" className="text-xs text-neutral-500 hover:text-neutral-900 inline-flex items-center gap-1">
          View <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="mt-4 flex items-end gap-1.5 h-16">
        {days.map((min, i) => {
          const day = addDays(weekStart, i);
          const today = isSameDay(day, new Date());
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${format(day, "EEE d MMM")}: ${formatMinutes(min)}`}>
              <div
                className={`w-full rounded-sm ${today ? "bg-neutral-900" : "bg-neutral-300"}`}
                style={{ height: `${Math.max(min > 0 ? 6 : 2, Math.round((min / max) * 100))}%` }}
              />
              <span className={`text-[10px] ${today ? "text-neutral-900 font-medium" : "text-neutral-400"}`}>{format(day, "EEEEE")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
