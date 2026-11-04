import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { envAccountFor, envTokenFor, sendMessage } from "@/lib/meta";
import { orderSummaryBlock } from "@/lib/orders";
import type { Channel, Order } from "@/lib/types";

export const runtime = "nodejs";

/**
 * The human step. Maya books; the owner confirms or cancels here, and the
 * customer gets told either way on the channel they wrote in on.
 *
 *   PATCH /api/orders/:id  { status: "confirmed" | "cancelled", note?: string }
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { status?: string; note?: string } | null;
  if (body?.status !== "confirmed" && body?.status !== "cancelled") {
    return NextResponse.json({ error: "status must be confirmed or cancelled" }, { status: 400 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("*, conversations(*, channel_connections(*))")
    .eq("id", id)
    .single();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "pending") {
    return NextResponse.json({ error: `Order is already ${order.status}` }, { status: 409 });
  }

  const conversation = order.conversations;
  const connection = conversation?.channel_connections;
  const channel: Channel | null = connection?.channel ?? null;
  const accountId = connection?.external_account_id ?? (channel ? envAccountFor(channel) ?? null : null);
  const accessToken = connection?.access_token ?? (channel ? envTokenFor(channel) ?? null : null);

  const note = body.note?.trim();
  const text =
    body.status === "confirmed"
      ? `Your order is confirmed 🎉\n\n${orderSummaryBlock(order as Order)}${note ? `\n\n${note}` : ""}` +
        `\n\nDhanyabad for shopping with us 🙏`
      : `Sorry, we couldn't confirm order #${order.order_number} this time 🙏${note ? `\n${note}` : ""}` +
        `\nMessage us anytime and we'll help you find something else.`;

  const sent = await sendMessage(channel, accountId, conversation.external_customer_id, text, accessToken);

  const { data: updated, error } = await supabase
    .from("orders")
    .update({
      status: body.status,
      confirmed_at: body.status === "confirmed" ? new Date().toISOString() : null,
      notes: note || order.notes,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    direction: "outbound",
    sender_type: "human",
    body: text,
    external_message_id: sent.messageId ?? null,
    status: sent.ok ? "sent" : "failed",
  });
  await supabase
    .from("conversations")
    .update({ status: sent.ok ? "open" : "needs_human", last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  if (!sent.ok) {
    return NextResponse.json({ order: updated, error: sent.error ?? "send failed" }, { status: 502 });
  }
  return NextResponse.json({ order: updated });
}
