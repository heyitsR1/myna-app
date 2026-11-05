import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchImage } from "@/lib/media";

export const runtime = "nodejs";

/**
 * GET /api/media/:messageId — the photo a customer sent, for the phone
 * thread. WhatsApp media needs the bearer token and Instagram CDN links
 * expire, so the browser never fetches them directly.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const { data } = await supabase.from("messages").select("media").eq("id", id).maybeSingle();
  const image = data?.media ? await fetchImage(data.media) : null;
  if (!image) return new Response(null, { status: 404 });
  const bytes = Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: { "Content-Type": image.media_type, "Cache-Control": "private, max-age=86400" },
  });
}
