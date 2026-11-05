import { notFound } from "next/navigation";
import { cache } from "react";
import OrderScreen from "@/components/phone/OrderScreen";
import type { PhoneOrder } from "@/components/phone/format";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/orders/[id]">) {
  const order = await loadOrder((await params).id);
  return { title: order ? `Order #${order.order_number} · Myna` : "Order · Myna" };
}

// Shared by generateMetadata and the page, so the order is read once per request.
const loadOrder = cache(async (id: string): Promise<PhoneOrder | null> => {
  const supabase = getSupabaseAdmin();
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase
    .from("orders")
    .select("*, conversations(customer_name, channel_connections(channel))")
    .eq("id", id)
    .maybeSingle();
  return (data as PhoneOrder | null) ?? null;
});

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const order = await loadOrder((await params).id);
  if (!order) notFound();
  return <OrderScreen initial={order} />;
}
