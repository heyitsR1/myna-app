/**
 * The customer's order-check page (/o/<token>), server side. Maya's booking
 * message links here; the customer either says the details look right or
 * fixes the address, phone or quantity, and confirms.
 *
 * The customer's "looks right" only sets `customer_confirmed_at`. The order's
 * status is the owner's (or Autopilot's) to change, never this page's.
 *
 * Access is the token alone: 32 random url-safe characters, never the order
 * number, and a token resolves to exactly one order. Cancelled or shipped
 * orders are read-only; the quantity is fixed once the owner has confirmed.
 */
import { getSupabaseAdmin } from "@/lib/supabase";
import { inValley, offersApplied } from "@/lib/offers";
import { notifyOwner } from "@/lib/push";
import { formatNpr } from "@/lib/orders";
import type { OrderItem, Product } from "@/lib/types";

export const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

const STORE_URL = (process.env.STORE_URL ?? "https://monso.tailsgate.com").replace(/\/$/, "");

export interface CustomerOrderView {
  orderNumber: number;
  status: "pending" | "confirmed" | "shipped" | "cancelled";
  brandName: string;
  item: { sku: string; name: string; unitPrice: number; quantity: number; photo: string | null };
  total: number;
  customerName: string | null;
  address: string | null;
  phone: string | null;
  inValley: boolean | null;
  offers: string[];
  customerConfirmedAt: string | null;
  canEdit: boolean;
  canEditQuantity: boolean;
}

interface OrderRow {
  id: string;
  order_number: number;
  brand_id: string;
  status: CustomerOrderView["status"];
  items: OrderItem[];
  total: number | string;
  customer_name: string | null;
  delivery_address: string | null;
  phone: string | null;
  customer_confirmed_at: string | null;
  customer_edits: unknown[] | null;
  conversation_id: string | null;
  brands: { name: string } | null;
}

function photoFor(p: Pick<Product, "image_url" | "slug"> | null): string | null {
  const path = p?.image_url ?? (p?.slug ? `/products/${p.slug}.jpg` : null);
  if (!path) return null;
  return path.startsWith("http") ? path : `${STORE_URL}${path}`;
}

async function loadRow(token: string): Promise<OrderRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !TOKEN_RE.test(token)) return null;
  const { data } = await supabase
    .from("orders")
    .select("id, order_number, brand_id, status, items, total, customer_name, delivery_address, phone, customer_confirmed_at, customer_edits, conversation_id, brands(name)")
    .eq("public_token", token)
    .maybeSingle();
  return (data as OrderRow | null) ?? null;
}

export async function loadCustomerOrder(token: string): Promise<CustomerOrderView | null> {
  const row = await loadRow(token);
  if (!row) return null;
  const supabase = getSupabaseAdmin()!;
  const first = row.items[0];
  const { data: product } = first
    ? await supabase.from("products").select("image_url, slug").eq("brand_id", row.brand_id).eq("sku", first.sku).maybeSingle()
    : { data: null };
  return toView(row, product as Pick<Product, "image_url" | "slug"> | null);
}

function toView(row: OrderRow, product: Pick<Product, "image_url" | "slug"> | null): CustomerOrderView {
  const first = row.items[0] ?? { sku: "", name: "", quantity: 1, unit_price: 0 };
  const open = row.status === "pending" || row.status === "confirmed";
  return {
    orderNumber: row.order_number,
    status: row.status,
    brandName: row.brands?.name ?? "Monso Eyewear",
    item: { sku: first.sku, name: first.name, unitPrice: Number(first.unit_price), quantity: first.quantity, photo: photoFor(product) },
    total: Number(row.total),
    customerName: row.customer_name,
    address: row.delivery_address,
    phone: row.phone,
    inValley: inValley(row.delivery_address),
    offers: offersApplied(row.delivery_address),
    customerConfirmedAt: row.customer_confirmed_at,
    canEdit: open,
    canEditQuantity: row.status === "pending" && row.items.length === 1,
  };
}

export interface CustomerUpdate {
  address?: string;
  phone?: string;
  quantity?: number;
}

type UpdateResult = { ok: true; order: CustomerOrderView } | { ok: false; status: number; error: string };

/** "Looks right" (no fields) or "fix and confirm" (any of address, phone, quantity). */
export async function confirmByCustomer(token: string, update: CustomerUpdate): Promise<UpdateResult> {
  const row = await loadRow(token);
  if (!row) return { ok: false, status: 404, error: "We couldn't find this order." };
  if (row.status !== "pending" && row.status !== "confirmed") {
    return { ok: false, status: 409, error: `This order is ${row.status}, so it can't be changed here. Message the shop instead.` };
  }

  const now = new Date().toISOString();
  const fields: Record<string, unknown> = { customer_confirmed_at: now };
  const edits: Array<{ at: string; field: string; from: unknown; to: unknown }> = [];

  if (update.address !== undefined) {
    const address = update.address.replace(/\s+/g, " ").trim();
    if (address.length < 3 || address.length > 200) return { ok: false, status: 400, error: "Please enter your delivery address." };
    if (address !== (row.delivery_address ?? "")) {
      fields.delivery_address = address;
      edits.push({ at: now, field: "address", from: row.delivery_address, to: address });
    }
  }
  if (update.phone !== undefined) {
    const phone = update.phone.replace(/[^\d+\s-]/g, "").replace(/\s+/g, " ").trim();
    const digits = phone.replace(/\D/g, "").length;
    if (digits < 7 || digits > 15) return { ok: false, status: 400, error: "Please enter a phone number we can call." };
    if (phone !== (row.phone ?? "")) {
      fields.phone = phone;
      edits.push({ at: now, field: "phone", from: row.phone, to: phone });
    }
  }
  if (update.quantity !== undefined) {
    const quantity = Math.round(Number(update.quantity));
    const current = row.items[0]?.quantity;
    if (quantity !== current) {
      if (row.status !== "pending" || row.items.length !== 1) {
        return { ok: false, status: 409, error: "The quantity can't be changed now. Message the shop instead." };
      }
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > 20) return { ok: false, status: 400, error: "Quantity must be between 1 and 20." };
      const items = [{ ...row.items[0], quantity }];
      fields.items = items;
      fields.total = items[0].unit_price * quantity;
      edits.push({ at: now, field: "quantity", from: current, to: quantity });
    }
  }
  if (edits.length) fields.customer_edits = [...(row.customer_edits ?? []), ...edits];

  const supabase = getSupabaseAdmin()!;
  const { data, error } = await supabase
    .from("orders")
    .update(fields)
    .eq("id", row.id)
    .in("status", ["pending", "confirmed"])
    .select("id, order_number, brand_id, status, items, total, customer_name, delivery_address, phone, customer_confirmed_at, customer_edits, conversation_id, brands(name)")
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: "Couldn't save just now. Please try again." };
  if (!data) return { ok: false, status: 409, error: "This order just changed. Please reload the page." };

  // The owner hears about a fix, not about a plain "looks right" (that shows on the order card).
  if (edits.length) {
    const what = edits.map((e) => e.field).join(", ");
    await notifyOwner({
      kind: "order",
      title: `Order #${row.order_number}: customer updated ${what}`,
      body: `${row.items[0]?.name ?? "Order"} · ${formatNpr(Number(fields.total ?? row.total))}${fields.delivery_address ? ` · ${String(fields.delivery_address).split(",")[0]}` : ""}`,
      url: `/orders/${row.id}`,
      tag: `order-${row.id}`,
    });
  }

  const { data: product } = await supabase
    .from("products")
    .select("image_url, slug")
    .eq("brand_id", row.brand_id)
    .eq("sku", row.items[0]?.sku ?? "")
    .maybeSingle();
  return { ok: true, order: toView(data as unknown as OrderRow, product as Pick<Product, "image_url" | "slug"> | null) };
}
