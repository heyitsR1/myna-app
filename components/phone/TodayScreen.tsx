"use client";

import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import ChatRow from "@/components/phone/ChatRow";
import { CHANNEL_LABEL, nameOf, type PhoneConversation } from "@/components/phone/chat";
import { ago, npr, type PhoneOrder } from "@/components/phone/format";
import { NotificationSetupCard } from "@/components/phone/NotificationCard";
import OrderRow from "@/components/phone/OrderRow";
import { usePoll, type FeedItem, type Summary } from "@/components/phone/usePoll";
import { usePush } from "@/components/phone/usePush";

/**
 * The Home Screen start page: what Maya did today, what needs the owner,
 * and a live feed of every channel.
 */
export default function TodayScreen() {
  const push = usePush();
  const summary = usePoll<Summary>("/api/summary", 10000);
  const orders = usePoll<{ pending?: PhoneOrder[] }>("/api/orders", 10000);
  const inbox = usePoll<{ conversations?: PhoneConversation[] }>("/api/inbox", 10000);
  // Refreshed by every poll, so "2m ago" stays fresh without a clock of its own.
  const now = Math.max(summary.at, orders.at, inbox.at);

  const s = summary.data;
  const pending = orders.data?.pending ?? null;
  const needsChats = (inbox.data?.conversations ?? []).filter((c) => c.status === "needs_human");
  const loading = pending === null || inbox.data === null;
  const nothing = !loading && pending.length === 0 && needsChats.length === 0;
  const setupFirst = push.state !== "on" && push.state !== "loading";

  return (
    <div className="ph">
      <header className="ph-top">
        <div className="ph-brand">
          <BrandMark size={28} />
          <span className="ph-brand-name">{s?.shop ?? "Myna"}</span>
        </div>
        <span className="ph-top-right">
          <span className="ph-live">
            <span className="live-dot" aria-hidden="true" />
            {s?.autopilot ? "Autopilot" : "Maya is on"}
          </span>
          <Link href="/m/settings" className="ph-icon-btn" aria-label="Maya settings">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </Link>
        </span>
      </header>

      <main className="ph-main with-tabs">
        <h1 className="ph-large">{greeting()}</h1>

        <section className="ph-maya" aria-label="Maya today">
          <div className="ph-maya-head">
            <span className="ph-maya-spark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3l2.2 6.6L21 12l-6.8 2.4L12 21l-2.2-6.6L3 12l6.8-2.4z" />
              </svg>
            </span>
            Maya today
            {s?.today.medianReplySeconds != null && (
              <span className="ph-maya-speed num">replies in ~{fmtSeconds(s.today.medianReplySeconds)}</span>
            )}
          </div>
          <div className="ph-maya-big num">{s ? npr(s.today.revenue) : "—"}</div>
          <div className="ph-maya-big-sub">booked from DMs today</div>
          <div className="ph-maya-stats">
            <Stat n={s?.today.chats} label="chats" />
            <Stat n={s?.today.replies} label="replies sent" />
            <Stat n={s?.today.orders} label="orders" />
          </div>
        </section>

        {setupFirst && <NotificationSetupCard push={push} />}

        <section className="ph-sec" aria-labelledby="needs-title">
          <div className="ph-sec-head">
            <h2 id="needs-title" className="ph-title sm">
              Needs you
            </h2>
            {!loading && pending.length + needsChats.length > 0 && (
              <span className="ph-count num">{pending.length + needsChats.length}</span>
            )}
          </div>
          {loading ? (
            <div className="ph-skeleton" aria-hidden="true">
              <span />
              <span />
            </div>
          ) : nothing ? (
            <div className="ph-empty">
              <span className="ph-empty-check" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <div>
                <div className="ph-empty-title">All caught up</div>
                <div className="ph-empty-sub">Maya is answering. New orders show up here and on your lock screen.</div>
              </div>
            </div>
          ) : (
            <>
              {pending.length > 0 && (
                <ul className="ph-list">
                  {pending.slice(0, 5).map((o, i) => (
                    <OrderRow key={o.id} order={o} now={now} index={i} />
                  ))}
                </ul>
              )}
              {needsChats.length > 0 && (
                <ul className="ph-chats inset">
                  {needsChats.slice(0, 5).map((c, i) => (
                    <ChatRow key={c.id} c={c} now={now} index={i} />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        {s && s.feed.length > 0 && (
          <section className="ph-sec" aria-labelledby="live-title">
            <div className="ph-sec-head">
              <h2 id="live-title" className="ph-title sm">
                Live
              </h2>
              <span className="live-dot" aria-hidden="true" />
            </div>
            <ul className="ph-feed">
              {s.feed.slice(0, 8).map((f) => (
                <FeedRow key={f.id} f={f} now={now} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function Stat({ n, label }: { n?: number; label: string }) {
  return (
    <div className="ph-maya-stat">
      <b className="num">{n ?? "—"}</b>
      <span>{label}</span>
    </div>
  );
}

function FeedRow({ f, now }: { f: FeedItem; now: number }) {
  const conv = f.conversations;
  const name = conv ? nameOf(conv) : "Customer";
  const channel = conv?.channel_connections?.channel;
  const actor =
    f.direction === "inbound" ? name : f.sender_type === "ai" ? "Maya" : "You";
  const verb = f.direction === "inbound" ? "" : ` → ${name}`;
  return (
    <li>
      <Link href={`/m/chats/${f.conversation_id}`} className="ph-feed-row">
        <span className={`ph-feed-dot ${f.direction === "inbound" ? "in" : f.sender_type}`} aria-hidden="true" />
        <span className="ph-feed-text">
          <span className="ph-feed-head">
            <b>
              {actor}
              {verb}
            </b>
            <span>
              {channel ? CHANNEL_LABEL[channel] : ""} · {ago(f.created_at, now)}
            </span>
          </span>
          <span className="ph-feed-body">{f.body}</span>
        </span>
      </Link>
    </li>
  );
}

function greeting(): string {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kathmandu" }).format(new Date()),
  );
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmtSeconds(s: number): string {
  return s < 90 ? `${s}s` : `${Math.round(s / 60)} min`;
}
