import Link from "next/link";
import { ago, areaOf, channelOf, customerOf, itemsLine, npr, type PhoneOrder } from "@/components/phone/format";

export default function OrderRow({ order, now, index }: { order: PhoneOrder; now: number; index: number }) {
  const channel = channelOf(order);
  const area = areaOf(order.delivery_address);
  const status =
    order.status === "pending"
      ? null
      : order.status === "cancelled"
        ? { cls: "rose", text: "Cancelled" }
        : order.confirmed_by === "maya"
          ? { cls: "green", text: "Maya confirmed" }
          : { cls: "green", text: order.status === "shipped" ? "Shipped" : "Confirmed" };

  return (
    <li style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}>
      <Link href={`/orders/${order.id}`} className={`ph-order ${order.status === "pending" ? "pending" : ""}`}>
        <span className="ph-order-top">
          <span className="ph-order-no num">#{order.order_number}</span>
          <span className={`ph-ch ${channel.key}`}>{channel.label}</span>
          <span className="ph-order-time">{ago(order.created_at, now)}</span>
        </span>
        <span className="ph-order-items">{itemsLine(order) || "Order"}</span>
        <span className="ph-order-bottom">
          <span className="ph-order-who">
            {customerOf(order)}
            {area ? ` · ${area}` : ""}
          </span>
          {status ? (
            <span className={`pill ${status.cls}`}>{status.text}</span>
          ) : (
            <span className="ph-order-total num">{npr(order.total)}</span>
          )}
        </span>
      </Link>
    </li>
  );
}
