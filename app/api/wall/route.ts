import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DISCOUNT_ASK, isAbusive, maskContact } from "@/lib/moderation";
import type { Channel, Message, Order, OrderItem } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Feed for the projector wall (`/wall`). Everything the audience might see is
 * decided here, server-side, so nothing reaches the screen by accident:
 *
 *  - a customer's text is shown only once triage has read it (or the
 *    pipeline finished without triage), and never when it is abusive;
 *  - phone numbers are masked, and order cards carry no address;
 *  - names are first-name only.
 */

export type WallState = "thinking" | "replied" | "booked" | "held" | "hidden";

export interface WallCard {
  id: string;
  channel: Channel | null;
  name: string;
  customerText: string | null;
  state: WallState;
  reply: string | null;
  holdLabel: string | null;
  replyMs: number | null;
  at: string;
}

type Row = {
  id: string;
  customer_name: string | null;
  external_customer_id: string;
  status: string;
  last_message_at: string | null;
  channel_connections: { channel: Channel } | null;
  messages: Pick<Message, "direction" | "sender_type" | "status" | "body" | "created_at" | "triage">[];
  orders: Pick<Order, "order_number" | "status" | "total" | "items" | "created_at">[];
};

function firstName(row: Row): string {
  const raw = row.customer_name?.replace(/\(@[^)]*\)/, "").trim();
  const first = raw?.split(/\s+/)[0];
  return first || `Guest ${row.external_customer_id.slice(-3)}`;
}

function holdLabel(body: string, triage: Message["triage"]): string {
  if (isAbusive(body, triage)) return "Not answered. The owner will decide.";
  if (triage?.intent === "negotiation" || DISCOUNT_ASK.test(body)) return "Discount ask. The owner decides prices.";
  if (triage?.intent === "complaint") return "Complaint. The owner will answer personally.";
  if ((triage?.asksForHuman ?? 0) >= 0.5) return "Asked for a person. The owner is on it.";
  return "Held for the owner to check.";
}

function toCard(row: Row): WallCard | null {
  const msgs = [...row.messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lastInboundIdx = msgs.map((m) => m.direction).lastIndexOf("inbound");
  if (lastInboundIdx === -1) return null;
  const inbound = msgs[lastInboundIdx];
  const after = msgs.slice(lastInboundIdx + 1).filter((m) => m.direction === "outbound");
  const sent = after.find((m) => m.status !== "draft_pending") ?? null;
  const held = row.status === "needs_human" && !sent;
  const abusive = isAbusive(inbound.body, inbound.triage);
  // Until triage has read the message we cannot know it is safe to show.
  const vetted = Boolean(inbound.triage) || Boolean(sent) || held;

  const pendingOrder = row.orders.find((o) => o.status !== "cancelled" && o.created_at >= inbound.created_at);
  let state: WallState;
  if (abusive) state = "hidden";
  else if (sent && pendingOrder) state = "booked";
  else if (sent) state = "replied";
  else if (held) state = "held";
  else state = "thinking";

  return {
    id: row.id,
    channel: row.channel_connections?.channel ?? null,
    name: firstName(row),
    customerText: abusive || !vetted ? null : maskContact(inbound.body),
    state,
    reply: sent && !abusive ? maskContact(sent.body) : null,
    holdLabel: state === "held" || state === "hidden" ? holdLabel(inbound.body, inbound.triage) : null,
    replyMs: sent ? new Date(sent.created_at).getTime() - new Date(inbound.created_at).getTime() : null,
    at: inbound.created_at,
  };
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ configured: false, cards: [], orders: [], stats: null });

  const hours = Number(new URL(request.url).searchParams.get("hours") ?? "12");
  const since = new Date(Date.now() - Math.max(1, Math.min(hours, 72)) * 3600_000).toISOString();

  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, customer_name, external_customer_id, status, last_message_at, channel_connections(channel), " +
        "messages(direction, sender_type, status, body, created_at, triage), " +
        "orders(order_number, status, total, items, created_at)",
    )
    .gte("last_message_at", since)
    .order("last_message_at", { ascending: false })
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(8, { referencedTable: "messages" })
    .limit(60);
  if (error) return NextResponse.json({ configured: true, error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Row[];
  const cards = rows.map(toCard).filter((c): c is WallCard => c !== null);
  const replyTimes = cards.map((c) => c.replyMs).filter((ms): ms is number => ms !== null && ms > 0);
  replyTimes.sort((a, b) => a - b);

  const orders = rows
    .flatMap((r) =>
      r.orders
        .filter((o) => o.status !== "cancelled" && o.created_at >= since)
        .map((o) => ({
          number: o.order_number,
          status: o.status,
          total: Number(o.total),
          item: (o.items as OrderItem[])[0]?.name ?? "",
          quantity: (o.items as OrderItem[]).reduce((n, i) => n + i.quantity, 0),
          name: firstName(r),
          at: o.created_at,
        })),
    )
    .sort((a, b) => b.at.localeCompare(a.at));

  return NextResponse.json({
    configured: true,
    cards: cards.slice(0, 24),
    orders: orders.slice(0, 8),
    stats: {
      chats: cards.length,
      replied: cards.filter((c) => c.state === "replied" || c.state === "booked").length,
      orders: orders.length,
      held: cards.filter((c) => c.state === "held" || c.state === "hidden").length,
      medianReplyMs: replyTimes.length ? replyTimes[Math.floor(replyTimes.length / 2)] : null,
    },
  });
}
