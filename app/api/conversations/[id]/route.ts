import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    ai_enabled?: boolean;
    status?: "open" | "needs_human" | "resolved";
    notes?: string | null;
    tags?: string[];
  } | null;
  if (
    !body ||
    (body.ai_enabled === undefined && body.status === undefined && body.notes === undefined && body.tags === undefined)
  ) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.ai_enabled !== undefined) patch.ai_enabled = body.ai_enabled;
  if (body.status !== undefined) patch.status = body.status;
  if (body.notes !== undefined) patch.notes = body.notes?.slice(0, 2000) || null;
  if (Array.isArray(body.tags)) {
    patch.tags = [...new Set(body.tags.filter((t) => typeof t === "string").map((t) => t.trim().slice(0, 24)).filter(Boolean))].slice(0, 8);
  }

  const { data, error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ conversation: data });
}
