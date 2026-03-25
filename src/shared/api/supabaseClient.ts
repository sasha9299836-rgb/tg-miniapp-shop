import { createClient } from "@supabase/supabase-js";

const supabaseUrl = String((import.meta as any).env?.VITE_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = String((import.meta as any).env?.VITE_SUPABASE_ANON_KEY ?? "").trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
