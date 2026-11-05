import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/orders — the phone app's list: every pending order, plus the most
 * recent decided ones, newest first, with the channel they came in on.
 */
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ pending: [], recent: [] });

  const select =
    "id, order_number, status, total, items, customer_name, delivery_address, created_at, confirmed_at, confirmed_by, source, conversations(customer_name, channel_connections(channel))";
  const [pending, recent] = await Promise.all([
    supabase.from("orders").select(select).eq("status", "pending").order("created_at", { ascending: false }).limit(50),
    supabase.from("orders").select(select).neq("status", "pending").order("created_at", { ascending: false }).limit(8),
  ]);
  if (pending.error || recent.error) {
    return NextResponse.json({ error: (pending.error ?? recent.error)!.message }, { status: 500 });
  }
  return NextResponse.json({ pending: pending.data ?? [], recent: recent.data ?? [] });
}
