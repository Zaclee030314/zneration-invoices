"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Picks the company everything in the Hub belongs to: documents, clients,
// projects, expenses and bank statements are all per company.
export function CompanySwitcher() {
  const { workspace, companies, isAdmin, switchCompany } = useWorkspace();
  const [switching, setSwitching] = useState<string | null>(null);
  const canAdd = companies.some((c) => c.role === "admin");

  async function pick(id: string) {
    if (id === workspace?.id || switching) return;
    setSwitching(id);
    const error = await switchCompany(id);
    if (error) {
      setSwitching(null);
      toast.error(error);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="mt-1 flex w-full items-center justify-between gap-1 rounded-md border bg-white px-2 py-1 text-left text-xs text-neutral-700 hover:border-neutral-400">
        <span className="truncate">{switching ? "Switching..." : workspace?.name ?? "Company"}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-neutral-500">Working in</DropdownMenuLabel>
        {companies.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => pick(c.id)} className="gap-2">
            <Building2 className="h-4 w-4 text-neutral-400" />
            <span className="flex-1 truncate">{c.name}</span>
            {c.id === workspace?.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/company">{isAdmin ? "Company details and invoice series" : "Company details"}</Link>
        </DropdownMenuItem>
        {canAdd && (
          <DropdownMenuItem asChild className="gap-2">
            <Link href="/settings/company?new=1">
              <Plus className="h-4 w-4" /> Add a company
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
