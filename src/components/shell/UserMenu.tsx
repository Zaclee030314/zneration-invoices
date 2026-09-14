"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace } from "@/lib/workspace";

export function UserMenu() {
  const router = useRouter();
  const { profile, role } = useWorkspace();
  const label = profile?.full_name || profile?.email || "";

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-800">{label}</p>
        {role && <p className="text-xs text-neutral-500 capitalize">{role}</p>}
      </div>
      <button onClick={signOut} title="Sign out" className="rounded p-1.5 text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-900">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
