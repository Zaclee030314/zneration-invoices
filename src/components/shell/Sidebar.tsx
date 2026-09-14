"use client";
import Link from "next/link";
import {
  LayoutDashboard, FolderKanban, Kanban, Users, CalendarDays, Timer,
  FileText, Receipt, FileSignature, Settings, Wallet,
} from "lucide-react";
import { NavLink } from "./NavLink";
import { UserMenu } from "./UserMenu";
import { TimerWidget } from "@/components/time/TimerWidget";
import { useWorkspace } from "@/lib/workspace";

const groups = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    title: "Work",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/pipeline", label: "Pipeline", icon: Kanban },
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/time", label: "Time", icon: Timer },
    ],
  },
  {
    title: "Documents",
    items: [
      { href: "/quotations", label: "Quotations", icon: FileSignature },
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/receipts", label: "Receipts", icon: Receipt },
    ],
  },
  { title: "Finance", items: [{ href: "/expenses", label: "Expenses", icon: Wallet }] },
  { title: "Settings", items: [{ href: "/settings/team", label: "Team", icon: Settings }] },
];

export function Sidebar() {
  const { workspace } = useWorkspace();
  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r bg-neutral-100/80">
      <div className="px-4 py-4 border-b">
        <Link href="/dashboard" className="block font-semibold text-neutral-900 leading-tight">
          Zneration Hub
        </Link>
        <p className="text-xs text-neutral-500 truncate">{workspace?.name ?? "Workspace"}</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {groups.map((g, i) => (
          <div key={i}>
            {g.title && <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{g.title}</p>}
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavLink key={it.href} href={it.href} label={it.label} icon={it.icon} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t py-1">
        <TimerWidget />
      </div>
      <div className="border-t px-1 py-1">
        <UserMenu />
      </div>
    </aside>
  );
}
