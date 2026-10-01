import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ingestDocument } from "@/lib/rag";
import { activeProvider, providerModels } from "@/lib/llm";

export const runtime = "nodejs";

/**
 * Re-chunk and re-embed every brand document with the *active* embedding
 * model. Required after switching LLM provider — Ollama's mxbai and Workers
 * AI's bge-m3 are both 1024-dim but not the same space, so old vectors
 * would match nonsense. Runs inline (a few seconds for a handful of docs).
 *
 *   POST /api/maintenance/reindex
 */
export async function POST() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const provider = await activeProvider();
  const { data: docs } = await supabase.from("documents").select("id, filename");
  const results: Array<{ filename: string; status: string; chunks: number | null }> = [];
  for (const doc of docs ?? []) {
    await ingestDocument(doc.id);
    const { data } = await supabase.from("documents").select("status, chunk_count").eq("id", doc.id).single();
    results.push({ filename: doc.filename, status: data?.status ?? "unknown", chunks: data?.chunk_count ?? null });
  }
  const ok = results.every((r) => r.status === "ready");
  return NextResponse.json({ ok, provider, embedModel: providerModels(provider).embed, documents: results }, { status: ok ? 200 : 500 });
}
