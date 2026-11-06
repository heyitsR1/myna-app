"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { WallCard } from "@/app/api/wall/route";
import PlatformGlyph from "@/components/PlatformGlyph";
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

interface WallData {
  cards: WallCard[];
  orders: WallOrder[];
  stats: { chats: number; replied: number; orders: number; held: number; medianReplyMs: number | null } | null;
}

const CHANNEL_LABEL: Record<Channel, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
};

const POLL_MS = 2000;
const VISIBLE_CARDS = 5;
const VISIBLE_ORDERS = 6;

function npr(n: number): string {
  return `Rs ${Math.round(n).toLocaleString("en-IN")}`;
}

function seconds(ms: number | null): string {
  return ms === null ? "–" : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function ago(at: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

/** What the screen shows, minus the numbers: when this changes, the layout moves. */
function layoutKey(d: WallData): string {
  const cards = d.cards.slice(0, VISIBLE_CARDS).map((c) => `${c.id}:${c.state}`);
  const orders = d.orders.slice(0, VISIBLE_ORDERS).map((o) => `${o.number}:${o.status}`);
  return cards.join(",") + "|" + orders.join(",");
}

export default function WallScreen({ handle }: { handle: string }) {
  const [data, setData] = useState<WallData | null>(null);
  const [now, setNow] = useState(0);
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
          setNow(Date.now());
          setStale(false);
        };
        // A new DM or a fresh reply reorders the feed. Let the browser morph
        // cards to their new places instead of jumping; numbers-only polls
        // just update in place.
        const key = layoutKey(json);
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

  const cards = data?.cards.slice(0, VISIBLE_CARDS) ?? [];
  const orders = data?.orders.slice(0, VISIBLE_ORDERS) ?? [];
  const stats = data?.stats;

  return (
    <main className="wall">
      <aside className="wall-side">
        <div className="wall-brand">
          <span className="wall-logo">myna</span>
          <span className={`wall-live ${stale ? "is-stale" : ""}`}>
            <i aria-hidden="true" />
            {stale ? "Reconnecting" : "Live from the room"}
          </span>
        </div>

        <section className="wall-stats" aria-label="Live totals">
          <Stat value={stats?.chats ?? 0} label="people messaged" />
          <Stat
            value={stats?.replied ?? 0}
            label="answered by Maya"
            note={stats?.held ? `${stats.held} held for the owner` : null}
          />
          <Stat value={seconds(stats?.medianReplyMs ?? 0)} label="typical reply" hot empty={!stats?.medianReplyMs} />
        </section>

        <div className="wall-cta">
          <img src="/wall-qr.svg" alt="" />
          <div className="wall-cta-lead">
            <span>@{handle}</span>
            Scan to message&nbsp;us
          </div>
          <div className="wall-cta-url">myna.tailsgate.com/try</div>
        </div>
      </aside>

      <section className="wall-feed" aria-live="polite">
        <h2 className="wall-col-title">Live conversations</h2>
        {cards.length === 0 ? (
          <div className="wall-empty">
            <div className="wall-empty-big">Send Monso a&nbsp;DM.</div>
            <div className="wall-empty-fine">Try “kati parcha?” and watch Maya answer here.</div>
          </div>
        ) : (
          <div className="wall-list">
            {cards.map((c) => (
              <Card key={c.id} card={c} now={now} />
            ))}
          </div>
        )}
      </section>

      <aside className="wall-orders">
        <h2 className="wall-col-title">
          Orders <span className="wall-col-count num">{stats?.orders ?? 0}</span>
        </h2>
        {orders.length ? (
          <ul>
            {orders.map((o) => (
              <li key={o.number} className="wall-order" style={{ viewTransitionName: `wall-o-${o.number}` }}>
                <div className="wall-order-top">
                  <span className="wall-order-num num">#{o.number}</span>
                  <span className="wall-order-total num">{npr(o.total)}</span>
                </div>
                <div className="wall-order-item">
                  {o.quantity > 1 ? `${o.quantity} × ` : ""}
                  {o.item}
                </div>
                <div className="wall-order-meta">
                  <span>{o.name}</span>
                  <span className={`wall-order-status is-${o.status}`}>
                    {o.status === "shipped" ? "Shipped" : o.status === "confirmed" ? "Confirmed" : "Owner confirming"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="wall-side-empty">The first order lands here.</div>
        )}
      </aside>
    </main>
  );
}

function Stat({
  value,
  label,
  note = null,
  hot = false,
  empty = false,
}: {
  value: number | string;
  label: string;
  note?: string | null;
  hot?: boolean;
  empty?: boolean;
}) {
  return (
    <div className={`wall-stat ${hot ? "is-hot" : ""} ${empty ? "is-empty" : ""}`}>
      <div className="wall-stat-value num">{value}</div>
      <div className="wall-stat-label">{label}</div>
      {note && <div className="wall-stat-note">{note}</div>}
    </div>
  );
}

function Card({ card, now }: { card: WallCard; now: number }) {
  return (
    <article className={`wall-card is-${card.state}`} style={{ viewTransitionName: `wall-c-${card.id}` }}>
      <div className="wall-who">
        {card.channel && (
          <span className="wall-glyph">
            <PlatformGlyph name={card.channel} size={20} />
          </span>
        )}
        <span className="wall-name">{card.name}</span>
        {card.channel && <span className="wall-meta">{CHANNEL_LABEL[card.channel]}</span>}
        {now > 0 && <span className="wall-meta">· {ago(card.at, now)}</span>}
      </div>

      <p className="wall-customer">
        {card.state === "hidden" ? (
          <span className="wall-muted">Message hidden</span>
        ) : card.customerText ? (
          card.customerText
        ) : (
          <span className="wall-muted">New message…</span>
        )}
      </p>

      {card.state === "thinking" && (
        <div className="wall-reply is-thinking">
          <span className="wall-maya">Maya is replying</span>
          <span className="wall-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
      {(card.state === "replied" || card.state === "booked") && card.reply && (
        <div className="wall-reply">
          <span className="wall-maya">
            Maya
            {card.replyMs !== null && card.replyMs > 0 && (
              <span className="wall-time num"> · replied in {seconds(card.replyMs)}</span>
            )}
            {card.state === "booked" && <span className="wall-booked">Order booked</span>}
          </span>
          <p>{card.reply}</p>
        </div>
      )}
      {(card.state === "held" || card.state === "hidden") && (
        <div className="wall-reply is-held">
          <span className="wall-maya">Held for the owner</span>
          <p>{card.holdLabel}</p>
        </div>
      )}
    </article>
  );
}
