"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const fn = mode === "signin" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn.call(supabase.auth, { email, password });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push("/invoices");
    router.refresh();
  }

  return (
    <div className="max-w-sm mx-auto bg-white p-6 rounded border mt-12">
      <h1 className="text-xl font-semibold mb-1">Zneration Invoices</h1>
      <p className="text-sm text-neutral-500 mb-4">{mode === "signin" ? "Sign in" : "Create account"}</p>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full border rounded px-3 py-2" placeholder="Email" type="email"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full border rounded px-3 py-2" placeholder="Password" type="password"
          value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button disabled={busy} className="w-full bg-neutral-900 text-white rounded py-2 disabled:opacity-50">
          {busy ? "..." : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>
      <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="text-sm text-neutral-500 mt-3 hover:underline">
        {mode === "signin" ? "Create account" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
