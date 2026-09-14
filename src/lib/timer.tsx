"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace";
import { getRunningEntry, startTimer, stopTimer, type TimeEntryWithRefs } from "@/lib/queries/time";

interface TimerContextValue {
  running: TimeEntryWithRefs | null;
  elapsedSec: number;
  loading: boolean;
  // Bumps every time a timer starts or stops so lists can re-fetch.
  version: number;
  start: (projectId: string, taskId?: string | null) => Promise<void>;
  stop: () => Promise<void>;
  refresh: () => Promise<void>;
}

const TimerContext = createContext<TimerContextValue>({
  running: null,
  elapsedSec: 0,
  loading: true,
  version: 0,
  start: async () => {},
  stop: async () => {},
  refresh: async () => {},
});

// Holds the signed-in user's single running time entry (the DB enforces one
// open entry per user) and ticks the elapsed seconds while it runs.
export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useWorkspace();
  const [running, setRunning] = useState<TimeEntryWithRefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      setRunning(await getRunningEntry(userId));
    } catch (e) {
      console.error("running timer lookup failed", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
  }, [userId, refresh]);

  // Compute from started_at rather than incrementing so the clock stays
  // accurate after tab sleeps.
  useEffect(() => {
    if (!running) {
      setElapsedSec(0);
      return;
    }
    const startedAt = new Date(running.started_at).getTime();
    const tick = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = useCallback(
    async (projectId: string, taskId?: string | null) => {
      if (!userId) return;
      try {
        const entry = await startTimer(userId, projectId, taskId);
        setRunning(entry);
        setVersion((v) => v + 1);
        toast.success(`Timer started${entry.projects ? ` · ${entry.projects.code}` : ""}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [userId]
  );

  const stop = useCallback(async () => {
    if (!running) return;
    try {
      const done = await stopTimer(running.id);
      setRunning(null);
      setVersion((v) => v + 1);
      toast.success(`Stopped · ${done.duration_min ?? 0}m logged`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [running]);

  const value = useMemo<TimerContextValue>(
    () => ({ running, elapsedSec, loading, version, start, stop, refresh }),
    [running, elapsedSec, loading, version, start, stop, refresh]
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer() {
  return useContext(TimerContext);
}
