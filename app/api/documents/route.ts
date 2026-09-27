import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ configured: false, documents: [], chunks: [] });
  }

  const [docsRes, chunksRes] = await Promise.all([
    supabase.from("documents").select("*").order("created_at", { ascending: false }),
    supabase
      .from("doc_chunks")
      .select("id, document_id, content, chunk_index")
      .order("chunk_index", { ascending: true })
      .limit(6),
  ]);

  if (docsRes.error) {
    return NextResponse.json(
      { configured: true, documents: [], chunks: [], error: docsRes.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    configured: true,
    documents: docsRes.data ?? [],
    chunks: chunksRes.data ?? [],
  });
}
