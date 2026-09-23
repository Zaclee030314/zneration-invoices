"use client";
import { Suspense } from "react";
import { ReceivedList } from "@/components/expenses/ReceivedList";

export default function MoneyReceivedPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading...</p>}>
      <ReceivedList />
    </Suspense>
  );
}
