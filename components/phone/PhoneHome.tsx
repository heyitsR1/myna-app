"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import BrandMark from "@/components/BrandMark";
import AutopilotSwitch from "@/components/phone/AutopilotSwitch";
import { NotificationRow, NotificationSetupCard } from "@/components/phone/NotificationCard";
import { ago, areaOf, channelOf, customerOf, itemsLine, npr, type PhoneOrder } from "@/components/phone/format";
import { usePush } from "@/components/phone/usePush";

/**
 * The owner's phone app (`/m`, the Home Screen start URL): what needs them,
 * what's been done, and the two switches that decide how loud Myna is.
 */
export default function PhoneHome() {
  const push = usePush();
  const [pending, setPending] = useState<PhoneOrder[] | null>(null);
  const [recent, setRecent] = useState<PhoneOrder[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const apply = useCallback((data: { pending?: PhoneOrder[]; recent?: PhoneOrder[] } | null) => {
    if (!data) return setPending((p) => p ?? []);
    setPending(data.pending ?? []);
    setRecent(data.recent ?? []);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    const load = () => fetchOrders().then(apply);
    load();
    const timer = setInterval(load, 15000);
    // Coming back from a notification or the app switcher: refresh at once.
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [apply]);

  const setupFirst = push.state !== "on" && push.state !== "loading";

  return (
    <div className="ph">
      <header className="ph-top">
        <div className="ph-brand">
          <BrandMark size={28} />
          <span className="ph-brand-name">Myna</span>
        </div>
        <span className="ph-live">
          <span className="live-dot" aria-hidden="true" />
          Maya is on
        </span>
      </header>

      <main className="ph-main">
        {setupFirst && <NotificationSetupCard push={push} />}

        <section className="ph-sec" aria-labelledby="needs-title">
          <div className="ph-sec-head">
            <h1 id="needs-title" className="ph-title">
              Needs you
            </h1>
            {pending && pending.length > 0 && <span className="ph-count num">{pending.length}</span>}
          </div>
          {pending === null ? (
            <div className="ph-skeleton" aria-hidden="true">
              <span />
              <span />
            </div>
          ) : pending.length === 0 ? (
            <div className="ph-empty">
              <span className="ph-empty-check" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <div>
                <div className="ph-empty-title">All caught up</div>
                <div className="ph-empty-sub">New orders will show up here and on your lock screen.</div>
              </div>
            </div>
          ) : (
            <ul className="ph-list">
              {pending.map((order, i) => (
                <OrderRow key={order.id} order={order} now={now} index={i} />
              ))}
            </ul>
          )}
        </section>

        {recent.length > 0 && (
          <section className="ph-sec" aria-labelledby="done-title">
            <h2 id="done-title" className="ph-label">
              Done recently
            </h2>
            <ul className="ph-list quiet">
              {recent.map((order, i) => (
                <OrderRow key={order.id} order={order} now={now} index={i} />
              ))}
            </ul>
          </section>
        )}

        <section className="ph-sec" aria-labelledby="settings-title">
          <h2 id="settings-title" className="ph-label">
            Settings
          </h2>
          <div className="ph-settings">
            <AutopilotSwitch />
            {push.state === "on" && <NotificationRow push={push} />}
          </div>
        </section>

        <Link href="/inbox" className="ph-foot-link">
          Open the full inbox
        </Link>
      </main>
    </div>
  );
}

async function fetchOrders(): Promise<{ pending?: PhoneOrder[]; recent?: PhoneOrder[] } | null> {
  try {
    const res = await fetch("/api/orders", { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function OrderRow({ order, now, index }: { order: PhoneOrder; now: number; index: number }) {
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
