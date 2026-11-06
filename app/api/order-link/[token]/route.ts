import { NextResponse } from "next/server";
import { confirmByCustomer, loadCustomerOrder, type CustomerUpdate } from "@/lib/order-link";

export const runtime = "nodejs";

/**
 * Public, behind the order's random token (see lib/order-link.ts and the
 * `api/order-link` exclusion in proxy.ts).
 *
 *   GET  /api/order-link/:token                       → the order as the customer sees it
 *   POST /api/order-link/:token  {}                   → "Looks right"
 *   POST /api/order-link/:token  {address?, phone?, quantity?} → fix, then confirm
 */
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const order = await loadCustomerOrder((await params).token);
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  return NextResponse.json({ order }, { headers });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Bad request" }, { status: 400, headers });
  const update: CustomerUpdate = {};
  if (typeof body.address === "string") update.address = body.address;
  if (typeof body.phone === "string") update.phone = body.phone;
  if (typeof body.quantity === "number") update.quantity = body.quantity;
  const result = await confirmByCustomer((await params).token, update);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers });
  return NextResponse.json({ order: result.order }, { headers });
}
