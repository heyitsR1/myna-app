/** Client-safe helpers for the phone chat screens. */
import type { Channel, Conversation, Message, Order } from "@/lib/types";

export interface PhoneConversation extends Conversation {
  channel_connections: { channel: Channel } | null;
  messages?: Pick<Message, "body" | "created_at" | "sender_type" | "direction" | "status">[];
  orders?: Pick<Order, "id" | "status" | "order_number" | "total">[];
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
};

export function nameOf(c: { customer_name: string | null; external_customer_id: string }): string {
  return c.customer_name?.trim() || `Customer ·${c.external_customer_id.slice(-4)}`;
}

export function initialsOf(c: { customer_name: string | null; external_customer_id: string }): string {
  const name = c.customer_name?.trim();
  if (!name) return c.external_customer_id.slice(-2).toUpperCase();
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Stable warm hue per customer so avatars are tellable apart at a glance. */
export function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export function moodOf(c: Conversation): { cls: string; label: string } | null {
  const heat = c.last_frustration === null ? null : Number(c.last_frustration);
  const warm = c.last_warmth === null ? null : Number(c.last_warmth);
  if (heat !== null && heat >= 1.5) return { cls: "rose", label: "Upset" };
  if (heat !== null && heat >= 1.0) return { cls: "amber", label: "Impatient" };
  if (warm !== null && warm >= 1.5) return { cls: "green", label: "Happy" };
  return null;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** Attachment-only DMs are stored with a fixed label by the webhook. */
export const ATTACHMENT_BODY =
  /^(Shared an? (video|photo|post|reel|file|attachment)|Sent a voice message|Mentioned you in a story)$/;

/** Maya's product-photo rows are logged as "📷 MS-03 Name · Rs 2,800". */
export function productPhoto(body: string): { sku: string; caption: string } | null {
  const m = body.match(/^📷\s+(MS-\d+)\s+(.*)$/);
  return m ? { sku: m[1], caption: m[2] } : null;
}
