"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/expenses", label: "Payments out" },
  { href: "/expenses/statements", label: "Statements" },
];

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <p className="text-sm text-neutral-500">
          Payments out of the company bank accounts, each backed by an invoice, receipt or explanation.
        </p>
      </div>
      <nav className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((t) => {
          const active = t.href === "/expenses" ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "px-3 py-2 text-sm -mb-px border-b-2 whitespace-nowrap",
                active ? "border-neutral-900 text-neutral-900 font-medium" : "border-transparent text-neutral-500 hover:text-neutral-800"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div>{children}</div>
    </div>
  );
}
