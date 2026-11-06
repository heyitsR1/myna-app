/** Client-safe formatters for the phone screens (lib/orders pulls in Supabase). */

export type ChannelName = "instagram" | "whatsapp" | "messenger";

export interface PhoneOrder {
  id: string;
  order_number: number;
  status: "pending" | "confirmed" | "shipped" | "cancelled";
  total: number | string;
  items: { sku: string; name: string; quantity: number; unit_price: number }[];
  customer_name: string | null;
  delivery_address: string | null;
  phone?: string | null;
  notes?: string | null;
  created_at: string;
  confirmed_at: string | null;
  confirmed_by?: "owner" | "maya" | null;
  source?: "dm" | "website" | null;
  conversation_id?: string | null;
  customer_confirmed_at?: string | null;
  customer_edits?: { at: string; field: string; from: unknown; to: unknown }[] | null;
  conversations?: { customer_name: string | null; channel_connections: { channel: ChannelName } | null } | null;
}

export function npr(amount: number | string): string {
  return `Rs ${Math.round(Number(amount)).toLocaleString("en-IN")}`;
}

export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function channelOf(order: PhoneOrder): { key: ChannelName | "web"; label: string } {
  if (order.source === "website") return { key: "web", label: "Website" };
  const channel = order.conversations?.channel_connections?.channel;
  if (channel === "instagram") return { key: channel, label: "Instagram" };
  if (channel === "whatsapp") return { key: channel, label: "WhatsApp" };
  if (channel === "messenger") return { key: channel, label: "Messenger" };
  return { key: "web", label: "DM" };
}

/**
 * "Customer checked the details ✓", plus what they changed on the order-check
 * page (/o/<token>). Null until they have opened it and confirmed. This is
 * the customer's check, not a confirmation: the owner still confirms.
 */
export function customerCheckLine(order: Pick<PhoneOrder, "customer_confirmed_at" | "customer_edits">): string | null {
  if (!order.customer_confirmed_at) return null;
  const fields = [...new Set((order.customer_edits ?? []).map((e) => e.field))];
  return `Customer checked the details ✓${fields.length ? ` · changed ${fields.join(", ")}` : ""}`;
}

export function customerOf(order: PhoneOrder): string {
  return order.customer_name || order.conversations?.customer_name || "Customer";
}

export function itemsLine(order: PhoneOrder): string {
  return (order.items ?? []).map((i) => (i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name)).join(", ");
}

/** "Koteshwor" out of "House 12, Koteshwor, Kathmandu" — the bit the owner recognises. */
export function areaOf(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? null;
  const last = parts[parts.length - 1].toLowerCase();
  const city = ["kathmandu", "ktm", "lalitpur", "bhaktapur", "nepal", "pokhara"].includes(last);
  return city && parts.length >= 2 ? parts[parts.length - 2] : parts[parts.length - 1];
}
