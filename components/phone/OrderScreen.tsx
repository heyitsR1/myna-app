"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ago, channelOf, customerOf, npr, type PhoneOrder } from "@/components/phone/format";

/**
 * Where a "New order" notification lands. Everything the owner needs to say
 * yes is above the fold, and the yes is a full-width button under their thumb.
 */
export default function OrderScreen({ initial }: { initial: PhoneOrder }) {
  const [order, setOrder] = useState(initial);
  const [busy, setBusy] = useState<"confirmed" | "cancelled" | null>(null);
  const [armedCancel, setArmedCancel] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justDecided, setJustDecided] = useState(false);
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (disarm.current) clearTimeout(disarm.current);
  }, []);

  const channel = channelOf(order);
  const customer = customerOf(order);
  const pending = order.status === "pending";

  const decide = async (status: "confirmed" | "cancelled") => {
    if (busy) return;
    if (status === "cancelled" && !armedCancel) {
      // Cancelling tells the customer no; ask for a second tap rather than a dialog.
      setArmedCancel(true);
      disarm.current = setTimeout(() => setArmedCancel(false), 3500);
      return;
    }
    setBusy(status);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json().catch(() => ({}))) as { order?: Partial<PhoneOrder>; error?: string };
      if (data.order) {
        setOrder((o) => ({ ...o, ...data.order }) as PhoneOrder);
        setJustDecided(true);
        navigator.vibrate?.(status === "confirmed" ? 18 : [10, 40, 10]);
        if (!res.ok) {
          setWarning(`Saved, but the message to the customer didn't send. Reply from the inbox.`);
        }
      } else if (res.status === 409) {
        setError(data.error ?? "This order was already decided.");
      } else {
        setError(data.error ?? "Couldn't update the order. Try again.");
      }
    } catch {
      setError("Couldn't reach Myna. Check your connection and try again.");
    } finally {
      setBusy(null);
      setArmedCancel(false);
    }
  };

  const statusPill =
    order.status === "pending"
      ? { cls: "amber", text: "Waiting for you" }
      : order.status === "cancelled"
        ? { cls: "rose", text: "Cancelled" }
        : order.confirmed_by === "maya"
          ? { cls: "green", text: "Confirmed by Maya" }
          : { cls: "green", text: order.status === "shipped" ? "Shipped" : "Confirmed" };

  return (
    <div className="ph ph-order-screen">
      <header className="ph-top bar">
        <Link href="/m" className="ph-back" aria-label="Back to orders">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Orders
        </Link>
        <span className="ph-top-title num">Order #{order.order_number}</span>
        <span className="ph-top-spacer" />
      </header>

      <main className="ph-main with-dock">
        <section className="ph-hero">
          <span className={`pill ${statusPill.cls}`}>{statusPill.text}</span>
          <div className="ph-total num">{npr(order.total)}</div>
          <div className="ph-hero-sub">
            {customer} · via {channel.label} · {ago(order.created_at)} ago
          </div>
        </section>

        <section className="ph-sec">
          <h2 className="ph-label">Items</h2>
          <ul className="ph-lines">
            {(order.items ?? []).map((item, i) => (
              <li key={`${item.sku}-${i}`} className="ph-line">
                <span className="ph-line-name">
                  {item.name}
                  <span className="ph-line-sku">{item.sku}</span>
                </span>
                <span className="ph-line-qty num">×{item.quantity}</span>
                <span className="ph-line-price num">{npr(item.unit_price * item.quantity)}</span>
              </li>
            ))}
            <li className="ph-line total">
              <span className="ph-line-name">Total</span>
              <span className="ph-line-price num">{npr(order.total)}</span>
            </li>
          </ul>
        </section>

        <section className="ph-sec">
          <h2 className="ph-label">Deliver to</h2>
          <dl className="ph-facts">
            <div>
              <dt>Name</dt>
              <dd>{customer}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{order.delivery_address || <span className="ph-missing">Not given yet</span>}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>
                {order.phone ? (
                  <a className="ph-tel num" href={`tel:${order.phone.replace(/[^\d+]/g, "")}`}>
                    {order.phone}
                  </a>
                ) : (
                  <span className="ph-missing">Not given yet</span>
                )}
              </dd>
            </div>
            {order.notes && (
              <div>
                <dt>Note</dt>
                <dd>{order.notes}</dd>
              </div>
            )}
          </dl>
        </section>
      </main>

      <footer className={`ph-dock ${pending ? "" : "decided"}`}>
        {pending ? (
          <>
            {error && <p className="ph-error dock">{error}</p>}
            <button className="ph-btn primary big" onClick={() => decide("confirmed")} disabled={busy !== null}>
              {busy === "confirmed" ? "Confirming…" : "Confirm order"}
            </button>
            <button
              className={`ph-btn ghost danger ${armedCancel ? "armed" : ""}`}
              onClick={() => decide("cancelled")}
              disabled={busy !== null}
            >
              {busy === "cancelled" ? "Cancelling…" : armedCancel ? "Tap again to cancel the order" : "Cancel order"}
            </button>
          </>
        ) : (
          <div className={`ph-done ${order.status === "cancelled" ? "cancelled" : ""} ${justDecided ? "fresh" : ""}`} role="status">
            <span className="ph-done-mark" aria-hidden="true">
              {order.status === "cancelled" ? (
                <svg viewBox="0 0 24 24">
                  <path d="M7 7l10 10M17 7L7 17" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </span>
            <span className="ph-done-text">
              <b>{order.status === "cancelled" ? "Order cancelled" : statusPill.text}</b>
              <span>
                {warning ??
                  (order.status === "cancelled"
                    ? `${customer} was told on ${channel.label}.`
                    : `${customer} got the confirmation on ${channel.label}.`)}
              </span>
            </span>
            <Link href="/m" className="ph-btn small">
              Done
            </Link>
          </div>
        )}
      </footer>
    </div>
  );
}
