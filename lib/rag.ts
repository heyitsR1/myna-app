import { getSupabaseAdmin } from "@/lib/supabase";
import { embedTexts } from "@/lib/embeddings";

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      // Prefer a paragraph boundary, then a sentence/line boundary.
      const window = clean.slice(start, end);
      const para = window.lastIndexOf("\n\n");
      if (para > CHUNK_SIZE * 0.4) {
        end = start + para;
      } else {
        const line = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(". "));
        if (line > CHUNK_SIZE * 0.4) end = start + line + 1;
      }
    }
    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

async function extractTextFromFile(
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (ext === "docx" || ext === "doc") {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  return buffer.toString("utf-8");
}

export async function ingestDocument(documentId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn("[rag] Supabase not configured; skipping ingestion");
    return;
  }

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();
  if (docError || !doc) {
    console.error("[rag] document not found:", documentId, docError?.message);
    return;
  }

  try {
    const { data: file, error: dlError } = await supabase.storage
      .from("brand-docs")
      .download(doc.storage_path);
    if (dlError || !file) throw new Error(`storage download failed: ${dlError?.message}`);

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractTextFromFile(doc.filename, buffer);
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("no extractable text in document");

    const embeddings = await embedTexts(chunks, "document");

    await supabase.from("doc_chunks").delete().eq("document_id", documentId);
    const rows = chunks.map((content, i) => ({
      document_id: documentId,
      brand_id: doc.brand_id,
      content,
      embedding: embeddings[i],
      chunk_index: i,
    }));
    const { error: insertError } = await supabase.from("doc_chunks").insert(rows);
    if (insertError) throw new Error(`chunk insert failed: ${insertError.message}`);

    await supabase
      .from("documents")
      .update({ status: "ready", chunk_count: chunks.length })
      .eq("id", documentId);
  } catch (err) {
    console.error("[rag] ingestion failed for", documentId, err);
    await supabase.from("documents").update({ status: "failed" }).eq("id", documentId);
  }
}

export interface RetrievedChunk {
  id: string;
  document_id: string;
  content: string;
  similarity: number;
}

export async function retrieveContext(
  brandId: string,
  query: string,
  k = 6,
): Promise<RetrievedChunk[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const [embedding] = await embedTexts([query], "query");
  const { data, error } = await supabase.rpc("match_doc_chunks", {
    query_embedding: embedding,
    match_brand_id: brandId,
    match_count: k,
  });
  if (error) {
    console.error("[rag] match_doc_chunks failed:", error.message);
    return [];
  }
  return (data ?? []) as RetrievedChunk[];
}
