"use client";

import { useState } from "react";
import type { CustomerOrderView } from "@/lib/order-link";

const npr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

type Mode = "view" | "edit" | "done";

export default function OrderCheck({ token, initial }: { token: string; initial: CustomerOrderView }) {
  const [order, setOrder] = useState(initial);
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState(initial.address ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [quantity, setQuantity] = useState(initial.item.quantity);

  const missing = !order.address || !order.phone;

  const send = async (body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/order-link/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { order?: CustomerOrderView; error?: string };
      if (res.ok && data.order) {
        setOrder(data.order);
        setAddress(data.order.address ?? "");
        setPhone(data.order.phone ?? "");
        setQuantity(data.order.item.quantity);
        setMode("done");
        navigator.vibrate?.(15);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setError(data.error ?? "Couldn't save just now. Please try again.");
      }
    } catch {
      setError("No connection. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const body: Record<string, unknown> = { address, phone };
    if (order.canEditQuantity) body.quantity = quantity;
    void send(body);
  };

  const status =
    order.status === "cancelled"
      ? { cls: "off", text: "Cancelled" }
      : order.status === "shipped"
        ? { cls: "ok", text: "On the way" }
        : order.status === "confirmed"
          ? { cls: "ok", text: "Confirmed by the shop" }
          : { cls: "wait", text: "Waiting for the owner to confirm" };

  const shownQty = mode === "edit" ? quantity : order.item.quantity;
  const itemsTotal = order.item.unitPrice * shownQty;
  const delivery =
    order.inValley === true
      ? "Free"
      : order.address
        ? "Free in the valley · Rs 150–250 outside"
        : "Free inside Kathmandu valley";

  return (
    <>
      {mode === "done" && (
        <div className="oc-thanks" role="status">
          <span className="oc-tick" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <div>
            <b>Thanks{order.customerName ? `, ${order.customerName.split(" ")[0]}` : ""}!</b>
            <span>
              {order.status === "pending"
                ? "Your details are saved. The owner will confirm your order shortly."
                : "Your details are saved."}
            </span>
          </div>
        </div>
      )}

      <section className="oc-card">
        <div className="oc-item">
          <div className="oc-photo">
            {order.item.photo ? <img src={order.item.photo} alt={order.item.name} /> : <span>{order.item.sku}</span>}
          </div>
          <div className="oc-item-text">
            <span className="oc-sku">{order.item.sku}</span>
            <h1>{order.item.name}</h1>
            <span className="oc-unit">{npr(order.item.unitPrice)} each</span>
          </div>
        </div>

        <dl className="oc-rows">
          <div>
            <dt>Quantity</dt>
            <dd>
              {mode === "edit" && order.canEditQuantity ? (
                <span className="oc-stepper">
                  <button type="button" aria-label="One less" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>
                    −
                  </button>
                  <output aria-live="polite">{quantity}</output>
                  <button type="button" aria-label="One more" onClick={() => setQuantity((q) => Math.min(20, q + 1))} disabled={quantity >= 20}>
                    +
                  </button>
                </span>
              ) : (
                shownQty
              )}
            </dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>{delivery}</dd>
          </div>
          <div className="oc-total">
            <dt>Total</dt>
            <dd>{npr(itemsTotal)}</dd>
          </div>
        </dl>

        <ul className="oc-offers" aria-label="This week's offers">
          {order.offers.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      </section>

      <section className="oc-card">
        <h2>Deliver to</h2>
        {mode === "edit" ? (
          <div className="oc-form">
            {order.customerName && <p className="oc-name">{order.customerName}</p>}
            <label>
              <span>Delivery address</span>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="street-address"
                enterKeyHint="next"
                placeholder="Area, street, nearby landmark"
              />
            </label>
            <label>
              <span>Phone</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                enterKeyHint="done"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98XXXXXXXX"
              />
            </label>
          </div>
        ) : (
          <dl className="oc-rows plain">
            {order.customerName && (
              <div>
                <dt>Name</dt>
                <dd>{order.customerName}</dd>
              </div>
            )}
            <div>
              <dt>Address</dt>
              <dd>{order.address || <span className="oc-gap">Not given yet</span>}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{order.phone || <span className="oc-gap">Not given yet</span>}</dd>
            </div>
          </dl>
        )}
      </section>

      <p className={`oc-status ${status.cls}`}>
        {status.text}
        {order.customerConfirmedAt && order.status !== "cancelled" && mode !== "done" ? " · you checked these ✓" : ""}
      </p>

      {error && (
        <p className="oc-error" role="alert">
          {error}
        </p>
      )}

      {order.canEdit ? (
        <div className="oc-actions">
          {mode === "edit" ? (
            <>
              <button className="oc-btn primary" onClick={save} disabled={busy || !address.trim() || !phone.trim()}>
                {busy ? "Saving…" : "Save and confirm"}
              </button>
              <button
                className="oc-btn ghost"
                onClick={() => {
                  setMode("view");
                  setError(null);
                  setAddress(order.address ?? "");
                  setPhone(order.phone ?? "");
                  setQuantity(order.item.quantity);
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </>
          ) : mode === "done" ? (
            <button className="oc-btn ghost" onClick={() => setMode("edit")}>
              Change something
            </button>
          ) : (
            <>
              {missing ? (
                <button className="oc-btn primary" onClick={() => setMode("edit")}>
                  Add address and phone
                </button>
              ) : (
                <button className="oc-btn primary" onClick={() => void send({})} disabled={busy}>
                  {busy ? "Saving…" : "Looks right"}
                </button>
              )}
              <button className="oc-btn ghost" onClick={() => setMode("edit")} disabled={busy}>
                Fix details
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="oc-locked">This order can&apos;t be changed here any more. Message the shop if something&apos;s wrong.</p>
      )}

      <p className="oc-foot">Questions? Just reply in the chat — Maya and the owner are there.</p>
    </>
  );
}
