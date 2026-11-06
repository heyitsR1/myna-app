"use client";

import { useEffect, useState } from "react";
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
const VISIBLE_CARDS = 4;

function npr(n: number): string {
  return `Rs ${Math.round(n).toLocaleString("en-IN")}`;
}

function seconds(ms: number | null): string {
  return ms === null ? "–" : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

export default function WallScreen({ handle }: { handle: string }) {
  const [data, setData] = useState<WallData | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/wall", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as WallData;
        if (alive) {
          setData(json);
          setStale(false);
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
  const stats = data?.stats;

  return (
    <main className="wall">
      <header className="wall-head">
        <div className="wall-brand">
          <span className={`wall-live ${stale ? "is-stale" : ""}`} aria-hidden="true" />
          <div>
            <div className="wall-title">Monso Eyewear</div>
            <div className="wall-sub">@{handle} · answered live by Maya, on Myna</div>
          </div>
        </div>
        <div className="wall-cta">
          Message us at <strong>myna.tailsgate.com/try</strong>
        </div>
      </header>

      <section className="wall-stats" aria-label="Live totals">
        <Stat value={stats?.chats ?? 0} label="people messaged" />
        <Stat value={stats?.replied ?? 0} label="answered by Maya" />
        <Stat value={stats?.orders ?? 0} label="orders booked" />
        <Stat value={stats?.held ?? 0} label="held for the owner" accent={Boolean(stats?.held)} />
        <Stat value={seconds(stats?.medianReplyMs ?? null)} label="typical reply time" />
      </section>

      <div className="wall-body">
        <section className="wall-feed" aria-live="polite">
          {cards.length === 0 ? (
            <div className="wall-empty">
              <div className="wall-empty-big">Send us a DM</div>
              <div className="wall-empty-fine">Try “kati parcha?” or “I’ll take the aviators”</div>
            </div>
          ) : (
            cards.map((c) => <Card key={c.id} card={c} />)
          )}
        </section>

        <aside className="wall-orders">
          <div className="wall-side-title">Orders, as they land</div>
          {data?.orders.length ? (
            <ul>
              {data.orders.map((o) => (
                <li key={o.number} className="wall-order">
                  <div className="wall-order-top">
                    <span className="num">#{o.number}</span>
                    <span className={`wall-order-status ${o.status}`}>
                      {o.status === "shipped" ? "Shipped" : o.status === "confirmed" ? "Confirmed" : "Waiting for owner"}
                    </span>
                  </div>
                  <div className="wall-order-item">
                    {o.quantity > 1 ? `${o.quantity} × ` : ""}
                    {o.item}
                  </div>
                  <div className="wall-order-meta">
                    {o.name} · <span className="num">{npr(o.total)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="wall-side-empty">The first one will appear here.</div>
          )}
        </aside>
      </div>
    </main>
  );
}

function Stat({ value, label, accent = false }: { value: number | string; label: string; accent?: boolean }) {
  return (
    <div className={`wall-stat ${accent ? "is-accent" : ""}`}>
      <div className="wall-stat-value num">{value}</div>
      <div className="wall-stat-label">{label}</div>
    </div>
  );
}

function Card({ card }: { card: WallCard }) {
  return (
    <article className={`wall-card is-${card.state}`}>
      <div className="wall-card-who">
        <span className={`wall-dot ${card.channel ?? ""}`} aria-hidden="true" />
        <span className="wall-name">{card.name}</span>
        {card.channel && <span className="wall-channel">{CHANNEL_LABEL[card.channel]}</span>}
      </div>

      <p className="wall-customer">
        {card.state === "hidden" ? (
          <span className="wall-muted">Message hidden</span>
        ) : card.customerText ? (
          card.customerText
        ) : (
          <span className="wall-muted">New message</span>
        )}
      </p>

      {card.state === "thinking" && (
        <div className="wall-reply is-thinking">
          <span className="wall-maya">Maya</span>
          <span className="wall-dots" aria-label="Maya is replying">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
      {(card.state === "replied" || card.state === "booked") && card.reply && (
        <div className="wall-reply">
          <span className="wall-maya">
            Maya{card.replyMs !== null && card.replyMs > 0 && <span className="wall-time num"> · {seconds(card.replyMs)}</span>}
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
