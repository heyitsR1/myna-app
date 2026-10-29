import { after, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateDefaultBrand } from "@/lib/brand";
import { ingestDocument } from "@/lib/rag";

export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = ["pdf", "docx", "doc", "txt", "md"];

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured — set the keys in .env.local" },
      { status: 503 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type .${ext} — use PDF, DOCX, or TXT` },
      { status: 400 },
    );
  }

  const brand = await getOrCreateDefaultBrand();
  if (!brand) {
    return NextResponse.json({ error: "Could not resolve brand" }, { status: 500 });
  }

  const storagePath = `${brand.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage
    .from("brand-docs")
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: document, error: insertError } = await supabase
    .from("documents")
    .insert({
      brand_id: brand.id,
      filename: file.name,
      storage_path: storagePath,
      status: "processing",
    })
    .select()
    .single();
  if (insertError || !document) {
    return NextResponse.json(
      { error: `Document insert failed: ${insertError?.message}` },
      { status: 500 },
    );
  }

  after(async () => {
    try {
      await ingestDocument(document.id);
    } catch (err) {
      console.error("[upload] ingestion failed:", err);
    }
  });

  return NextResponse.json({ document });
}
