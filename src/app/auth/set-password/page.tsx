"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) return setErr("Use at least 8 characters.");
    if (password !== confirm) return setErr("Passwords do not match.");
    setBusy(true);
    const { data, error } = await supabase.auth.updateUser({ password, data: fullName.trim() ? { full_name: fullName.trim() } : undefined });
    if (!error && data.user && fullName.trim()) {
      await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", data.user.id);
    }
    setBusy(false);
    if (error) return setErr(error.message);
    router.replace("/dashboard");
  }

  return (
    <div className="max-w-sm mx-auto bg-white p-6 rounded border mt-16">
      <h1 className="text-xl font-semibold mb-1">Set your password</h1>
      <p className="text-sm text-neutral-500 mb-4">Choose a password to finish setting up your account.</p>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full border rounded px-3 py-2" placeholder="Your name (optional)" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <input className="w-full border rounded px-3 py-2" placeholder="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <input className="w-full border rounded px-3 py-2" placeholder="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button disabled={busy} className="w-full bg-neutral-900 text-white rounded py-2 disabled:opacity-50">
          {busy ? "..." : "Save and continue"}
        </button>
      </form>
    </div>
  );
}
