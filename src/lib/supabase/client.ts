"use client";
import { createBrowserClient } from "@supabase/ssr";

// Fall back to placeholders so the app still builds when env vars
// aren't set yet (e.g. first Vercel deploy before Supabase is wired).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createBrowserClient(url, key);
export const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
