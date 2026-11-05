import { NextResponse } from "next/server";
import { decideOrder } from "@/lib/decide-order";

export const runtime = "nodejs";

/**
 * The human step. Maya books; the owner confirms or cancels here, and the
 * customer gets told either way on the channel they wrote in on.
 *
 *   PATCH /api/orders/:id  { status: "confirmed" | "cancelled", note?: string }
 */
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
