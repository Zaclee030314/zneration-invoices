"use client";
import { useState } from "react";
import { Play, Square } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProjectPicker } from "@/components/ProjectPicker";
import { useTimer } from "@/lib/timer";
import { formatClock } from "@/lib/queries/time";

// Sidebar timer: live clock + stop when running, otherwise a play button that
// opens a small project picker. Sized for the 224px sidebar.
export function TimerWidget() {
  const { running, elapsedSec, start, stop, loading } = useTimer();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="px-2.5 py-2 text-xs text-neutral-400">Loading timer…</div>;
  }

  if (running) {
    return (
      <div className="px-2.5 py-2 rounded bg-white border border-emerald-200 mx-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-neutral-800">
              {running.projects ? (
                <>
                  <span className="font-mono text-[11px] text-neutral-500 mr-1">{running.projects.code}</span>
                  {running.projects.name}
                </>
              ) : (
                "Project"
              )}
            </p>
            {running.tasks && <p className="truncate text-[11px] text-neutral-500">{running.tasks.title}</p>}
            <p className="font-mono text-sm tabular-nums text-emerald-700 mt-0.5">{formatClock(elapsedSec)}</p>
          </div>
          <button
            type="button"
            onClick={() => stop()}
            title="Stop timer"
            className="shrink-0 rounded p-1.5 text-red-600 hover:bg-red-50"
            aria-label="Stop timer"
          >
            <Square className="h-4 w-4" fill="currentColor" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
      <p className="text-xs text-neutral-400">No timer running</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" title="Start timer" aria-label="Start timer" className="rounded p-1.5 text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-900">
            <Play className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-72 p-3">
          <p className="text-xs font-medium text-neutral-700 mb-2">Start a timer on…</p>
          <ProjectPicker
            value={null}
            allowClear={false}
            placeholder="Pick a project"
            onSelect={(p) => {
              if (!p) return;
              setOpen(false);
              start(p.id, null);
            }}
          />
          <p className="text-[11px] text-neutral-400 mt-2">Or press play on any task to time it.</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
