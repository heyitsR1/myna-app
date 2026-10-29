import { getSupabaseAdmin } from "@/lib/supabase";
import type { Brand } from "@/lib/types";

/**
 * Dev-mode single-brand shortcut: until a real signup/OAuth flow exists,
 * server code resolves "the brand" as the first brand row, creating one on
 * first real use (a document upload or an incoming webhook message).
 */
export async function getOrCreateDefaultBrand(): Promise<Brand | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: existing } = await supabase
    .from("brands")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return existing as Brand;

  const { data: created, error } = await supabase
    .from("brands")
    .insert({ name: "My Shop" })
    .select()
    .single();
  if (error) {
    console.error("[brand] failed to create default brand:", error.message);
    return null;
  }
  return created as Brand;
}
