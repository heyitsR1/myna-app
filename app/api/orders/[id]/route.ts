import { NextResponse } from "next/server";
import { decideOrder } from "@/lib/decide-order";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * The human step. Maya books; the owner confirms or cancels here, and the
 * customer gets told either way on the channel they wrote in on.
 *
 *   PATCH /api/orders/:id  { status: "confirmed" | "cancelled", note?: string }
 */
/** The order as stored, for the phone order screen's poll (customer checks and fixes). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ order: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { status?: string; note?: string } | null;
  if (body?.status !== "confirmed" && body?.status !== "cancelled") {
    return NextResponse.json({ error: "status must be confirmed or cancelled" }, { status: 400 });
  }
  const result = await decideOrder(id, body.status, { note: body.note, by: "owner" });
  if (!result.order) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.error ? { order: result.order, error: result.error } : { order: result.order }, {
    status: result.status,
  });
}
