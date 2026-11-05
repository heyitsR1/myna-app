/**
 * Confirm or cancel a pending order and tell the customer on their channel.
 * One path for both deciders: the owner (PATCH /api/orders/:id, the phone
 * app) and Maya on Autopilot, so the customer gets the same message either
 * way and `confirmed_by` says who decided.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import { envAccountFor, envTokenFor, sendMessage } from "@/lib/meta";
import { orderSummaryBlock } from "@/lib/orders";
import type { Channel, Order } from "@/lib/types";

export interface DecideResult {
  ok: boolean;
  status: number;
  order?: Order;
  error?: string;
}

export async function decideOrder(
  id: string,
  decision: "confirmed" | "cancelled",
  opts: { note?: string; by: "owner" | "maya" },
): Promise<DecideResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, status: 503, error: "Supabase is not configured" };

  const { data: order } = await supabase
    .from("orders")
    .select("*, conversations(*, channel_connections(*))")
    .eq("id", id)
    .single();
  if (!order) return { ok: false, status: 404, error: "Order not found" };
  if (order.status !== "pending") return { ok: false, status: 409, error: `Order is already ${order.status}` };

  const conversation = order.conversations;
  const connection = conversation?.channel_connections;
  const channel: Channel | null = connection?.channel ?? null;
  const accountId = connection?.external_account_id ?? (channel ? envAccountFor(channel) ?? null : null);
  const accessToken = connection?.access_token ?? (channel ? envTokenFor(channel) ?? null : null);

  const note = opts.note?.trim();
  const text =
    decision === "confirmed"
      ? `Your order is confirmed 🎉\n\n${orderSummaryBlock(order as Order)}${note ? `\n\n${note}` : ""}` +
        `\n\nDhanyabad for shopping with us 🙏`
      : `Sorry, we couldn't confirm order #${order.order_number} this time 🙏${note ? `\n${note}` : ""}` +
        `\nMessage us anytime and we'll help you find something else.`;

  // Website orders have no conversation to message.
  const sent = conversation
    ? await sendMessage(channel, accountId, conversation.external_customer_id, text, accessToken)
    : { ok: true as const, messageId: undefined, error: undefined };

  const { data: updated, error } = await supabase
    .from("orders")
    .update({
      status: decision,
      confirmed_at: decision === "confirmed" ? new Date().toISOString() : null,
      confirmed_by: decision === "confirmed" ? opts.by : null,
      notes: note || order.notes,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return { ok: false, status: 500, error: error.message };

  if (conversation) {
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: "outbound",
      sender_type: opts.by === "maya" ? "ai" : "human",
      body: text,
      external_message_id: sent.messageId ?? null,
      status: sent.ok ? "sent" : "failed",
    });
    await supabase
      .from("conversations")
      .update({ status: sent.ok ? "open" : "needs_human", last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);
  }

  if (!sent.ok) return { ok: false, status: 502, order: updated as Order, error: sent.error ?? "send failed" };
  return { ok: true, status: 200, order: updated as Order };
}
