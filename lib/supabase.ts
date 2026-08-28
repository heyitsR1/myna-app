import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

/** Browser/SSR client using the anon key. Returns null when Supabase isn't configured. */
export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!browserClient) browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}

let adminClient: SupabaseClient | null = null;

/**
 * Service-role client — bypasses RLS. Server only (webhooks, ingestion,
 * reply pipeline). Returns null when keys are missing so the app can run
 * keyless in a degraded mode.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error("getSupabaseAdmin must only be called on the server");
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  if (!adminClient) {
    adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
