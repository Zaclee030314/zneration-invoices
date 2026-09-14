"use client";
import { ContentCalendar } from "@/components/calendar/ContentCalendar";

export default function CalendarPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Content calendar</h1>
      <ContentCalendar />
    </div>
  );
}
