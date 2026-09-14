"use client";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function NoAccessPage() {
  const router = useRouter();
  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded border mt-16 space-y-3">
      <h1 className="text-lg font-semibold">No workspace access</h1>
      <p className="text-sm text-neutral-600">
        Your account is not a member of any workspace yet. Ask an admin to invite you with the email you signed in with.
      </p>
      <button
        onClick={async () => {
          await supabase.auth.signOut();
          router.replace("/login");
        }}
        className="text-sm underline"
      >
        Sign out
      </button>
    </div>
  );
}
