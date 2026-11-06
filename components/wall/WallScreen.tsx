"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { WallCard } from "@/app/api/wall/route";
import type { Channel } from "@/lib/types";

interface WallOrder {
  number: number;
  status: string;
  total: number;
  item: string;
  quantity: number;
  name: string;
  at: string;
}

interface WallStats {
  chats: number | null;
  replied: number | null;
  orders: number | null;
  held: number | null;
  medianReplyMs: number | null;
}

interface WallData {
  cards?: WallCard[] | null;
  orders?: WallOrder[] | null;
  stats?: WallStats | null;
}

const CHANNEL_LABEL: Record<Channel, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
};

const POLL_MS = 2000;
// Readable from the back row means few things, large.
const VISIBLE_CARDS = 3;
const VISIBLE_ORDERS = 2;

function npr(n: number): string {
  return `Rs ${Math.round(n).toLocaleString("en-IN")}`;
}

/** A reply time worth showing. After a reset the data can hold zero, negative or day-long gaps. */
function plausibleMs(ms: number | null | undefined): ms is number {
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 && ms < 10 * 60_000;
}

function seconds(ms: number): string {
  return ms < 60_000 ? `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s` : `${Math.round(ms / 60_000)} min`;
}

/** Keep "Rs 2,800" on one line when a reply wraps. */
function tidy(text: string): string {
  return text.replace(/\bRs\.? (?=\d)/g, (m) => m.replace(" ", "\u00a0"));
}

function count(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** What the screen shows, minus the numbers: when this changes, the layout moves. */
function layoutKey(cards: WallCard[], orders: WallOrder[]): string {
  return cards.map((c) => `${c.id}:${c.state}`).join(",") + "|" + orders.map((o) => `${o.number}:${o.status}`).join(",");
}

export default function WallScreen({ handle }: { handle: string }) {
  const [data, setData] = useState<WallData | null>(null);
  const [stale, setStale] = useState(false);
  const lastKey = useRef("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/wall", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as WallData;
        if (!alive) return;
        const apply = () => {
          setData(json);
          setStale(false);
        };
        // A new DM or a fresh reply reorders the feed. Let the browser slide
        // conversations to their new places; numbers-only polls update in place.
        const key = layoutKey((json.cards ?? []).slice(0, VISIBLE_CARDS), (json.orders ?? []).slice(0, VISIBLE_ORDERS));
        const moved = lastKey.current !== "" && key !== lastKey.current;
        lastKey.current = key;
        const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (moved && !calm && typeof document.startViewTransition === "function") {
          document.startViewTransition(() => flushSync(apply));
        } else {
          apply();
        }
      } catch {
        if (alive) setStale(true);
      }
    };
    load();
    const t = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const cards = (data?.cards ?? []).slice(0, VISIBLE_CARDS);
  const allOrders = data?.orders ?? [];
  const orders = allOrders.slice(0, VISIBLE_ORDERS);
  const stats = data?.stats ?? null;
  const typical = plausibleMs(stats?.medianReplyMs) ? seconds(stats.medianReplyMs) : null;

  return (
    <main className="wall">
      <section className="wall-feed" aria-live="polite">
        {cards.length === 0 ? (
          <div className="wall-empty">
            <p className="wall-empty-big">
              DM <span className="wall-nowrap">@{handle}</span>
            </p>
            <p className="wall-empty-sub">Ask anything. Maya answers here, live.</p>
          </div>
        ) : (
          cards.map((c, i) => (
            <Conversation
              key={c.id}
              card={c}
              lead={i === 0}
              order={c.state === "booked" ? allOrders.find((o) => o.name === c.name && o.at >= c.at) : undefined}
            />
          ))
        )}
      </section>

      <aside className="wall-rail">
        <div className="wall-stats">
          <Stat value={count(stats?.chats)} label={count(stats?.chats) === 1 ? "message" : "messages"} />
          <Stat value={count(stats?.replied)} label="answered by Maya" />
          <Stat value={typical ?? "–"} label="typical reply" muted={!typical} />
        </div>

        {orders.length > 0 && (
          <ul className="wall-orders" aria-label="Latest orders">
            {orders.map((o) => (
              <li key={o.number} className="wall-order" style={{ viewTransitionName: `wall-o-${o.number}` }}>
                <span className="wall-order-top num">
                  Order #{o.number} · {npr(o.total)}
                </span>
                <span className="wall-order-item">
                  {o.quantity > 1 ? `${o.quantity} × ` : ""}
                  {o.item || o.name}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="wall-cta">
          <div className="wall-qr">
            {/* A static SVG; next/image would only add a loader. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wall-qr.svg" alt="QR code for myna.tailsgate.com/try" />
          </div>
          <p className="wall-cta-url">myna.tailsgate.com/try</p>
          {stale && <p className="wall-stale">Reconnecting…</p>}
        </div>
      </aside>
    </main>
  );
}

function Stat({ value, label, muted = false }: { value: number | string; label: string; muted?: boolean }) {
  return (
    <div className={`wall-stat ${muted ? "is-muted" : ""}`}>
      <span className="wall-stat-value num">{value}</span>
      <span className="wall-stat-label">{label}</span>
    </div>
  );
}

function Conversation({ card, lead, order }: { card: WallCard; lead: boolean; order?: WallOrder }) {
  const reply = card.state === "replied" || card.state === "booked" ? card.reply : null;
  const held = card.state === "held" || card.state === "hidden";
  return (
    <article
      className={`wall-convo ${lead ? "is-lead" : ""} is-${card.state}`}
      // Keyed on size too: a conversation stepping back from the lead fades and
      // reappears instead of morphing between two scales.
      style={{ viewTransitionName: `wall-c-${card.id}-${lead ? "lead" : "side"}` }}
    >
      <p className="wall-who">
        {card.name}
        {card.channel && <span className="wall-channel"> · {CHANNEL_LABEL[card.channel]}</span>}
      </p>

      <p className="wall-customer">
        {card.state === "hidden" ? (
          <span className="wall-quiet">Message hidden</span>
        ) : (
          (card.customerText ? tidy(card.customerText) : <span className="wall-quiet">New message…</span>)
        )}
      </p>

      {card.state === "thinking" && (
        <div className="wall-reply is-typing">
          <span className="wall-maya">Maya is typing</span>
          <span className="wall-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}

      {reply && (
        <div className="wall-reply">
          <p className="wall-maya">
            Maya
            {plausibleMs(card.replyMs) && <span className="wall-time num">{seconds(card.replyMs)}</span>}
          </p>
          <p className="wall-reply-text">{tidy(reply)}</p>
          {card.state === "booked" && (
            <p className="wall-booked num">
              {order ? `Order #${order.number} booked · ${npr(order.total)}` : "Order booked"}
            </p>
          )}
        </div>
      )}

      {held && (
        <div className="wall-reply is-held">
          <p className="wall-maya">Passed to the owner</p>
          {card.holdLabel && <p className="wall-reply-text">{card.holdLabel}</p>}
        </div>
      )}
    </article>
  );
}
