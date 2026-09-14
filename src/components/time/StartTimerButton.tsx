"use client";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTimer } from "@/lib/timer";
import { formatClock } from "@/lib/queries/time";

// Play/stop toggle for a project (optionally a task). Shows the stop icon
// when this exact project/task is the one currently running.
export function StartTimerButton({ projectId, taskId, size = "icon" }: { projectId: string; taskId?: string | null; size?: "sm" | "icon" }) {
  const { running, elapsedSec, start, stop, loading } = useTimer();
  const isThis = !!running && running.project_id === projectId && (running.task_id ?? null) === (taskId ?? null);
  const label = isThis ? `Stop timer (${formatClock(elapsedSec)})` : running ? "Start timer (stops the current one)" : "Start timer";

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isThis) stop();
    else start(projectId, taskId ?? null);
  }

  const Icon = isThis ? Square : Play;
  const button =
    size === "icon" ? (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`h-7 w-7 ${isThis ? "text-red-600 hover:text-red-700" : "text-neutral-500 hover:text-neutral-900"}`}
        onClick={toggle}
        disabled={loading}
        aria-label={label}
      >
        <Icon className="h-3.5 w-3.5" fill={isThis ? "currentColor" : "none"} />
      </Button>
    ) : (
      <Button type="button" variant={isThis ? "destructive" : "outline"} size="sm" onClick={toggle} disabled={loading}>
        <Icon className="h-3.5 w-3.5 mr-1.5" fill={isThis ? "currentColor" : "none"} />
        {isThis ? `Stop ${formatClock(elapsedSec)}` : "Start timer"}
      </Button>
    );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
