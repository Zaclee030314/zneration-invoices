"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

// Landing page for Supabase email links (invite, recovery, magic link).
// Handles both link styles: `?token_hash=...&type=...` (PKCE/OTP) and the
// implicit `#access_token=...` hash, which supabase-js picks up on its own.
function ConfirmInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const tokenHash = params.get("token_hash");
    const type = (params.get("type") ?? "invite") as EmailOtpType;
    const errorDesc = params.get("error_description");
    if (errorDesc) {
      setErr(errorDesc);
      return;
    }

    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      router.replace(type === "recovery" || type === "invite" ? "/auth/set-password" : "/dashboard");
    };

    if (tokenHash) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
        if (error) setErr(error.message);
        else go();
      });
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    const timer = setTimeout(() => {
      if (!done) setErr("This link is invalid or has expired. Ask an admin to send a new invite.");
    }, 8000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [params, router]);

  return (
    <div className="max-w-sm mx-auto bg-white p-6 rounded border mt-16">
      <h1 className="text-lg font-semibold mb-2">Zneration Hub</h1>
      {err ? <p className="text-sm text-red-600">{err}</p> : <p className="text-sm text-neutral-500">Signing you in...</p>}
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmInner />
    </Suspense>
  );
}
