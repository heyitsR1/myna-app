import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/** Midnight in Kathmandu (UTC+5:45), as an ISO string. */
function startOfShopDay(now = new Date()): string {
  const offset = (5 * 60 + 45) * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset).toISOString();
}

/**
 * GET /api/summary — the phone app's header data: tab badges, today's
 * numbers for Maya, and the latest activity across every channel.
 */
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ configured: false });
  const since = startOfShopDay();

  const [brand, needs, pending, today, orders, feed] = await Promise.all([
    supabase.from("brands").select("name, autopilot").order("created_at").limit(1).maybeSingle(),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "needs_human"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("messages")
      .select("conversation_id, direction, sender_type, status, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(2000),
    supabase.from("orders").select("total, status").gte("created_at", since),
    supabase
      .from("messages")
      .select(
        "id, body, direction, sender_type, status, created_at, conversation_id, conversations(customer_name, external_customer_id, channel_connections(channel))",
      )
      .neq("status", "draft_pending")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  // Maya's speed: time from a customer's message to her first reply after it.
  const rows = today.data ?? [];
  const waiting = new Map<string, number>();
  const gaps: number[] = [];
  const chats = new Set<string>();
  let replies = 0;
  for (const m of rows) {
    if (m.direction === "inbound") {
      chats.add(m.conversation_id);
      if (!waiting.has(m.conversation_id)) waiting.set(m.conversation_id, Date.parse(m.created_at));
    } else if (m.sender_type === "ai" && m.status === "sent") {
      replies++;
      const t = waiting.get(m.conversation_id);
      if (t !== undefined) gaps.push((Date.parse(m.created_at) - t) / 1000);
      waiting.delete(m.conversation_id);
    } else if (m.sender_type === "human") {
      waiting.delete(m.conversation_id);
    }
  }
  gaps.sort((a, b) => a - b);
  const booked = (orders.data ?? []).filter((o) => o.status !== "cancelled");

  return NextResponse.json({
    configured: true,
    shop: brand.data?.name ?? "Your shop",
    autopilot: brand.data?.autopilot === true,
    needs: needs.count ?? 0,
    pendingOrders: pending.count ?? 0,
    today: {
      chats: chats.size,
      replies,
      medianReplySeconds: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : null,
      orders: booked.length,
      revenue: booked.reduce((sum, o) => sum + Number(o.total), 0),
    },
    feed: feed.data ?? [],
  });
}
