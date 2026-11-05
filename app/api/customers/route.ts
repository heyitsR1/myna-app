import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type Channel = "instagram" | "whatsapp" | "messenger" | "website";

interface OrderRow {
  id: string;
  order_number: number;
  status: string;
  total: number | string;
  items: unknown;
  phone: string | null;
  delivery_address: string | null;
  customer_name: string | null;
  created_at: string;
  confirmed_by: string | null;
  source: string | null;
  conversation_id: string | null;
}

interface ConvRow {
  id: string;
  customer_name: string | null;
  external_customer_id: string;
  created_at: string;
  last_message_at: string | null;
  status: string;
  notes: string | null;
  tags: string[] | null;
  channel_connections: { channel: Channel } | null;
}

export interface Customer {
  key: string;
  name: string;
  external_customer_id: string;
  channels: Channel[];
  conversations: { id: string; channel: Channel }[];
  /** Notes and tags live on this conversation (the most recent one). */
  primaryConversationId: string | null;
  firstSeen: string;
  lastSeen: string;
  orders: OrderRow[];
  spent: number;
  phone: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  needsYou: boolean;
}

/** Last 10 digits, so "+977 984-1234567" and "9841234567" are one person. */
function phoneKey(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-10) : null;
}

/**
 * GET /api/customers — every person who has DMed or ordered, one row each.
 * A customer who wrote on Instagram and WhatsApp with the same phone number
 * on their orders is merged into one.
 */
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ customers: [] });

  const orderCols =
    "id, order_number, status, total, items, phone, delivery_address, customer_name, created_at, confirmed_by, source, conversation_id";
  const [convs, orders] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, customer_name, external_customer_id, created_at, last_message_at, status, notes, tags, channel_connections(channel)")
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase.from("orders").select(orderCols).order("created_at", { ascending: false }),
  ]);
  if (convs.error || orders.error) {
    return NextResponse.json({ error: (convs.error ?? orders.error)!.message }, { status: 500 });
  }

  const byConv = new Map<string, OrderRow[]>();
  const loose: OrderRow[] = [];
  for (const o of (orders.data ?? []) as OrderRow[]) {
    if (o.conversation_id) byConv.set(o.conversation_id, [...(byConv.get(o.conversation_id) ?? []), o]);
    else loose.push(o);
  }

  const customers = new Map<string, Customer>();
  const add = (key: string, c: Customer) => {
    const existing = customers.get(key);
    if (!existing) return customers.set(key, c);
    existing.channels = [...new Set([...existing.channels, ...c.channels])];
    existing.conversations.push(...c.conversations);
    existing.orders = [...existing.orders, ...c.orders].sort((a, b) => b.created_at.localeCompare(a.created_at));
    existing.spent += c.spent;
    if (c.firstSeen < existing.firstSeen) existing.firstSeen = c.firstSeen;
    if (c.lastSeen > existing.lastSeen) {
      existing.lastSeen = c.lastSeen;
      if (c.primaryConversationId) {
        existing.primaryConversationId = c.primaryConversationId;
        existing.notes = c.notes ?? existing.notes;
      }
    }
    existing.tags = [...new Set([...existing.tags, ...c.tags])];
    existing.needsYou ||= c.needsYou;
    existing.phone ??= c.phone;
    existing.address ??= c.address;
  };

  const spentOf = (os: OrderRow[]) => os.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0);

  for (const conv of (convs.data ?? []) as unknown as ConvRow[]) {
    const channel = conv.channel_connections?.channel ?? "instagram";
    const os = byConv.get(conv.id) ?? [];
    const withPhone = os.find((o) => o.phone);
    const withAddress = os.find((o) => o.delivery_address);
    const name = conv.customer_name?.trim() || os.find((o) => o.customer_name)?.customer_name || `Customer ·${conv.external_customer_id.slice(-4)}`;
    const key = phoneKey(withPhone?.phone ?? null) ?? conv.id;
    add(key, {
      key,
      name,
      external_customer_id: conv.external_customer_id,
      channels: [channel],
      conversations: [{ id: conv.id, channel }],
      primaryConversationId: conv.id,
      firstSeen: conv.created_at,
      lastSeen: conv.last_message_at ?? conv.created_at,
      orders: os,
      spent: spentOf(os),
      phone: withPhone?.phone ?? null,
      address: withAddress?.delivery_address ?? null,
      notes: conv.notes,
      tags: conv.tags ?? [],
      needsYou: conv.status === "needs_human",
    });
  }

  // Website orders have no conversation; group them by phone number.
  for (const o of loose) {
    const key = phoneKey(o.phone) ?? `order-${o.id}`;
    add(key, {
      key,
      name: o.customer_name?.trim() || "Website customer",
      external_customer_id: key,
      channels: ["website"],
      conversations: [],
      primaryConversationId: null,
      firstSeen: o.created_at,
      lastSeen: o.created_at,
      orders: [o],
      spent: spentOf([o]),
      phone: o.phone,
      address: o.delivery_address,
      notes: null,
      tags: [],
      needsYou: false,
    });
  }

  const list = [...customers.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  return NextResponse.json({ customers: list });
}
