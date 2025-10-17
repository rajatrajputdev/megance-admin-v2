import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

if (!url || !/^https?:\/\//.test(url)) {
  // Helpful error to catch misconfigured env early
  throw new Error(`Missing or invalid VITE_SUPABASE_URL: "${url}"`);
}
if (!anonKey) {
  throw new Error("Missing VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(url, anonKey);
