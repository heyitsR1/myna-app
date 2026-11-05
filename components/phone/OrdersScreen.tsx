"use client";

import { useState } from "react";
import { npr, type PhoneOrder } from "@/components/phone/format";
import OrderRow from "@/components/phone/OrderRow";
import { usePoll } from "@/components/phone/usePoll";

export default function OrdersScreen() {
  const { data, at: now } = usePoll<{ pending?: PhoneOrder[]; recent?: PhoneOrder[] }>("/api/orders", 10000);
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const pending = data?.pending ?? null;
  const recent = data?.recent ?? [];
  const list = tab === "pending" ? pending : recent;
  const waiting = (pending ?? []).reduce((sum, o) => sum + Number(o.total), 0);

  return (
    <div className="ph">
      <header className="ph-top">
        <h1 className="ph-top-large">Orders</h1>
        {pending && pending.length > 0 && <span className="ph-top-meta num">{npr(waiting)} to confirm</span>}
      </header>
      <main className="ph-main with-tabs">
        <div className="ph-seg" role="tablist">
          <button role="tab" aria-selected={tab === "pending"} className={tab === "pending" ? "on" : ""} onClick={() => setTab("pending")}>
            To confirm{pending && pending.length > 0 ? ` · ${pending.length}` : ""}
          </button>
          <button role="tab" aria-selected={tab === "done"} className={tab === "done" ? "on" : ""} onClick={() => setTab("done")}>
            Done
          </button>
        </div>
        {list === null ? (
          <div className="ph-skeleton" aria-hidden="true">
            <span />
            <span />
          </div>
        ) : list.length === 0 ? (
          <div className="ph-empty">
            <span className="ph-empty-check" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <div>
              <div className="ph-empty-title">{tab === "pending" ? "Nothing to confirm" : "No orders yet"}</div>
              <div className="ph-empty-sub">Maya books orders from your DMs. They land here.</div>
            </div>
          </div>
        ) : (
          <ul className={`ph-list ${tab === "done" ? "quiet" : ""}`} key={tab}>
            {list.map((o, i) => (
              <OrderRow key={o.id} order={o} now={now} index={i} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
