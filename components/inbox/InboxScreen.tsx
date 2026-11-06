"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { AiSource, Channel, Conversation, Message, Order, OrderItem } from "@/lib/types";
import { customerCheckLine } from "@/components/phone/format";

interface InboxConversation extends Conversation {
  channel_connections: { channel: Channel; external_account_id: string } | null;
  messages: Pick<Message, "body" | "created_at" | "sender_type" | "direction" | "status">[];
  orders: Pick<Order, "id" | "status" | "order_number" | "total">[];
}

function npr(amount: number): string {
  return `Rs ${Math.round(amount).toLocaleString("en-IN")}`;
}

type Filter = "all" | "instagram" | "whatsapp" | "messenger" | "needs" | "orders";

const CHANNEL_DOT: Record<Channel, string> = {
  whatsapp: "wa",
  instagram: "ig",
  messenger: "fb",
};

const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
};

const CHANNEL_COLOR: Record<Channel, string> = {
  whatsapp: "var(--wa)",
  instagram: "var(--ig)",
  messenger: "var(--fb)",
};

function initials(conv: InboxConversation): string {
  const name = conv.customer_name?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }
  return conv.external_customer_id.slice(-2).toUpperCase();
}

function displayName(conv: InboxConversation): string {
  return conv.customer_name?.trim() || `Customer ·${conv.external_customer_id.slice(-4)}`;
}

/**
 * Jev scores frustration and warmth independently, so a message can be both
 * polite and impatient. A list row has space for one chip and heat is what an
 * owner needs to catch first, so frustration outranks warmth here.
 */
function mood(conv: InboxConversation): { cls: string; label: string } | null {
  const heat = conv.last_frustration === null ? null : Number(conv.last_frustration);
  const warm = conv.last_warmth === null ? null : Number(conv.last_warmth);
  if (heat !== null && heat >= 1.5) return { cls: "rose", label: "Upset" };
  if (heat !== null && heat >= 1.0) return { cls: "amber", label: "Impatient" };
  if (warm !== null && warm >= 1.5) return { cls: "green", label: "Happy" };
  return null;
}

const INTENT_LABEL: Record<string, string> = {
  question: "Question",
  catalogue: "Wants the price list",
  buy: "Wants to buy",
  complaint: "Complaint",
  negotiation: "Wants a discount",
  thanks: "Thank you",
  other: "Other",
};

/** Attachment-only DMs are stored with a fixed label by the webhook. */
const ATTACHMENT_BODY = /^(Shared an? (video|photo|post|reel|file|attachment)|Sent a voice message|Mentioned you in a story)$/;

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function InboxScreen() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  // A push notification opens /inbox?c=<conversation id> on that thread. The
  // first render is the loading state whatever this holds, so reading the URL
  // here can't cause a hydration mismatch.
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("c"),
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [composerText, setComposerText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Big-screen mode for the stage: larger type, faster polling. Remembered
  // per browser; `?projector=1` turns it on from a bookmark.
  const [projector, setProjector] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const loadInbox = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox");
      const data = await res.json();
      setConfigured(Boolean(data.configured));
      setConversations(data.conversations ?? []);
    } catch {
      setConfigured(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      const data = await res.json();
      if (selectedIdRef.current === conversationId) {
        setMessages(data.messages ?? []);
        setOrders(data.orders ?? []);
      }
    } catch {
      // keep whatever is on screen
    }
  }, []);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("projector");
    const on = fromUrl !== null ? fromUrl !== "0" : localStorage.getItem("myna-projector") === "1";
    const t = window.setTimeout(() => setProjector(on), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("projector", projector);
    localStorage.setItem("myna-projector", projector ? "1" : "0");
  }, [projector]);

  useEffect(() => {
    const kick = window.setTimeout(loadInbox, 0);
    const poll = window.setInterval(() => {
      loadInbox();
      if (selectedIdRef.current) loadMessages(selectedIdRef.current);
    }, projector ? 2000 : 4000);

    // Live updates when the anon key can see the tables (post-auth setups);
    // the poller above covers dev mode.
    const supabase = getSupabase();
    const channel = supabase
      ?.channel("myna-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          loadInbox();
          if (selectedIdRef.current) loadMessages(selectedIdRef.current);
        },
      )
      .subscribe();

    return () => {
      window.clearTimeout(kick);
      window.clearInterval(poll);
      channel?.unsubscribe();
    };
  }, [loadInbox, loadMessages, projector]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    if (!selectedId) return;
    const t = window.setTimeout(() => loadMessages(selectedId), 0);
    return () => window.clearTimeout(t);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  const visible = useMemo(() => {
    return conversations.filter((c) => {
      if (filter === "all") return true;
      if (filter === "needs") return c.status === "needs_human";
      if (filter === "orders") return c.orders?.some((o) => o.status === "pending");
      return c.channel_connections?.channel === filter;
    });
  }, [conversations, filter]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const needsCount = conversations.filter((c) => c.status === "needs_human").length;
  const pendingDraft = messages.find((m) => m.status === "draft_pending") ?? null;
  const pendingOrder = orders.find((o) => o.status === "pending") ?? null;
  // The judgment shown is the one for the customer's most recent message —
  // outbound messages carry no triage.
  const latestTriage =
    [...messages].reverse().find((m) => m.direction === "inbound")?.triage ?? null;

  const decideOrder = async (orderId: string, status: "confirmed" | "cancelled") => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ? `Could not update order: ${data.error}` : "Could not update order");
      } else {
        showToast(status === "confirmed" ? `Order confirmed. ${displayName(selected)} has been told.` : "Order cancelled. The customer has been told.");
      }
      await Promise.all([loadMessages(selected.id), loadInbox()]);
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!selected || !composerText.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/conversations/${selected.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: composerText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ? `Send failed: ${data.error}` : "Send failed");
      } else {
        setComposerText("");
        showToast(`Sent to ${displayName(selected)}`);
      }
      await Promise.all([loadMessages(selected.id), loadInbox()]);
    } finally {
      setBusy(false);
    }
  };

  const approveDraft = async (draftId: string) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/conversations/${selected.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approveDraftId: draftId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ? `Send failed: ${data.error}` : "Send failed");
      } else {
        showToast(`Sent to ${displayName(selected)}`);
      }
      await Promise.all([loadMessages(selected.id), loadInbox()]);
    } finally {
      setBusy(false);
    }
  };

  const patchConversation = async (
    patch: { ai_enabled?: boolean; status?: Conversation["status"] },
    note: string,
  ) => {
    if (!selected) return;
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    showToast(note);
    await loadInbox();
  };

  if (configured === false) {
    return (
      <section className="screen">
        <div className="empty">
          <div className="empty-ico">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M3 5v14a9 3 0 0 0 18 0V5" />
              <path d="M3 12a9 3 0 0 0 18 0" />
            </svg>
          </div>
          <div className="big">Connect Supabase to open your inbox</div>
          <div className="fine">
            Copy <code>.env.example</code> to <code>.env.local</code>, add your Supabase
            URL and keys, run the migrations in <code>supabase/migrations</code>, then
            restart the dev server. <code>SETUP.md</code> has the full walkthrough.
          </div>
        </div>
      </section>
    );
  }

  const FILTERS: [Filter, string][] = [
    ["all", "All"],
    ["needs", "Needs you"],
    ["orders", "Orders"],
  ];

  return (
    <section className="screen">
      {/* ── conversation list ── */}
      <div className="col-list">
        <div className="list-head">
          <div className="list-head-row">
            <h1 className="page-title">Inbox</h1>
            {conversations.length > 0 && (
              <span className="list-count num">
                {conversations.length} {conversations.length === 1 ? "chat" : "chats"}
              </span>
            )}
            <button
              className={`projector-toggle ${projector ? "on" : ""}`}
              aria-pressed={projector}
              onClick={() => setProjector((p) => !p)}
              title="Larger text for a projector"
            >
              Big screen
            </button>
          </div>
          <div className="h-sub">
            {conversations.length === 0
              ? "Instagram, WhatsApp and Facebook in one place"
              : needsCount > 0
                ? `${needsCount} ${needsCount === 1 ? "needs" : "need"} your reply`
                : "Maya has everything handled"}
          </div>
        </div>
        <div className="chips" role="tablist" aria-label="Filter conversations">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              className={`chip ${filter === value ? "active" : ""}`}
              onClick={() => setFilter(value)}
            >
              {label}
              {value === "needs" && needsCount > 0 && (
                <span className="chip-count">{needsCount}</span>
              )}
            </button>
          ))}
        </div>
        <div className="convos">
          {visible.length === 0 ? (
            <div className="empty">
              <div className="empty-ico">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                  <path d="M5.4 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.1z" />
                </svg>
              </div>
              <div className="big">
                {conversations.length === 0 ? "No messages yet" : "Nothing here"}
              </div>
              <div className="fine">
                {conversations.length === 0
                  ? "New DMs from your connected channels will appear here."
                  : "No conversations match this filter."}
              </div>
            </div>
          ) : (
            visible.map((conv) => {
              const ch = conv.channel_connections?.channel ?? "instagram";
              const last = conv.messages[0];
              const m = mood(conv);
              const pending = conv.orders?.some((o) => o.status === "pending");
              return (
                <button
                  key={conv.id}
                  className={`convo ${conv.id === selectedId ? "sel" : ""}`}
                  aria-current={conv.id === selectedId ? "true" : undefined}
                  onClick={() => {
                    if (conv.id !== selectedId) {
                      setMessages([]);
                      setOrders([]);
                    }
                    setSelectedId(conv.id);
                  }}
                >
                  <div className="ava">
                    {initials(conv)}
                    <i className={CHANNEL_DOT[ch]} aria-label={CHANNEL_LABEL[ch]} />
                  </div>
                  <div className="c-body">
                    <div className="c-top">
                      <span className="c-name">{displayName(conv)}</span>
                      <span className="c-time">
                        {formatTime(conv.last_message_at ?? conv.created_at)}
                      </span>
                    </div>
                    <div className="c-snip">{last?.body ?? "…"}</div>
                    {(pending || conv.status === "needs_human" || m) && (
                      <div className="c-tags">
                        {pending ? (
                          <span className="pill amber">Order to confirm</span>
                        ) : conv.status === "needs_human" ? (
                          <span className="pill hot">Needs you</span>
                        ) : null}
                        {m && <span className={`pill ${m.cls}`}>{m.label}</span>}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── thread ── */}
      <div className="col-thread">
        {!selected ? (
          <div className="empty">
            <img className="empty-art" src="/brand/myna-phone.webp" alt="" width={480} height={550} />
            <div className="big">Select a conversation</div>
            <div className="fine">
              Maya answers what she can. Anything she isn&rsquo;t sure about waits here for you.
            </div>
          </div>
        ) : (
          <>
            <div className="t-head">
              <div className="ava">
                {initials(selected)}
                <i className={CHANNEL_DOT[selected.channel_connections?.channel ?? "instagram"]} />
              </div>
              <div>
                <div className="t-name">{displayName(selected)}</div>
                <div className="t-meta">
                  <span
                    className="ch-ico"
                    style={{
                      background: CHANNEL_COLOR[selected.channel_connections?.channel ?? "instagram"],
                    }}
                  />
                  {CHANNEL_LABEL[selected.channel_connections?.channel ?? "instagram"]}
                  {selected.status === "needs_human" && " · Needs you"}
                  {selected.status === "resolved" && " · Resolved"}
                </div>
              </div>
              <div className="t-actions">
                <button
                  role="switch"
                  aria-checked={selected.ai_enabled}
                  className={`maya-toggle ${selected.ai_enabled ? "" : "off"}`}
                  onClick={() =>
                    patchConversation(
                      { ai_enabled: !selected.ai_enabled },
                      selected.ai_enabled ? "Maya paused for this chat" : "Maya is back on for this chat",
                    )
                  }
                >
                  Maya <span className="switch" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="thread" ref={threadRef} aria-live="polite">
              {messages.length === 0 && <div className="day">Loading conversation…</div>}
              {messages.map((m) =>
                m.status === "draft_pending" ? (
                  <div className="draft" key={m.id}>
                    <div className="draft-tag">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                      Maya drafted this and is waiting for you
                    </div>
                    <div className="draft-bubble">{m.body}</div>
                    {(m.ai_sources?.length ?? 0) > 0 && (
                      <div className="draft-src">
                        From your knowledge
                        {(m.ai_sources as AiSource[]).slice(0, 2).map((s, i) => (
                          <span className="src-chip" key={i}>
                            {Math.round(s.similarity * 100)}% match
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="draft-actions">
                      <button className="btn primary" disabled={busy} onClick={() => approveDraft(m.id)}>
                        Send Draft
                      </button>
                      <button className="btn ghost" onClick={() => setComposerText(m.body)}>
                        Edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={m.id}
                    className={`m-group ${m.direction === "inbound" ? "in" : "out"} ${m.sender_type === "ai" ? "ai" : ""}`}
                  >
                    {m.direction !== "inbound" && (
                      <div className="m-who">
                        {m.sender_type === "ai" ? (
                          <>
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" />
                            </svg>
                            Maya
                          </>
                        ) : (
                          "You"
                        )}
                      </div>
                    )}
                    {ATTACHMENT_BODY.test(m.body) ? (
                      <div className="msg-media">
                        <span className="msg-media-ico" aria-hidden="true">
                          <svg viewBox="0 0 24 24">
                            <path d="M8 5.5v13l11-6.5z" />
                          </svg>
                        </span>
                        {m.body}
                      </div>
                    ) : (
                      <div
                        className={`msg ${m.direction === "inbound" ? "in" : "out"} ${
                          m.status === "failed" ? "failed" : ""
                        }`}
                      >
                        {m.body}
                      </div>
                    )}
                    <div className="stamp">
                      {formatTime(m.created_at)}
                      {m.status === "failed" ? " · Not delivered" : ""}
                    </div>
                  </div>
                ),
              )}
            </div>

            <div className="composer">
              <div className="composer-box">
                <input
                  type="text"
                  name="reply"
                  autoComplete="off"
                  aria-label="Reply"
                  placeholder="Reply as yourself…"
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendReply();
                  }}
                />
                <button
                  className="send"
                  aria-label="Send reply"
                  disabled={busy || !composerText.trim()}
                  onClick={sendReply}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 19V5" />
                    <path d="m5 12 7-7 7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── context panel ── */}
      <aside className="col-ctx" aria-label="Conversation details">
        {!selected ? (
          <div className="ctx-sec">
            <div className="ctx-label">Details</div>
            <p className="ctx-note">
              Open a conversation to see the customer, any orders Maya booked and how she read
              their last message.
            </p>
          </div>
        ) : (
          <>
            <div className="ctx-sec">
              <div className="cust">
                <div className="ava lg">
                  {initials(selected)}
                  <i className={CHANNEL_DOT[selected.channel_connections?.channel ?? "instagram"]} />
                </div>
                <div>
                  <div className="cust-name">{displayName(selected)}</div>
                  <div className="cust-meta">
                    {CHANNEL_LABEL[selected.channel_connections?.channel ?? "instagram"]} customer
                  </div>
                </div>
              </div>
              <div className="kvs">
                <div className="kv">
                  <span className="k">First message</span>
                  <b>{formatTime(selected.created_at)}</b>
                </div>
                <div className="kv">
                  <span className="k">Messages</span>
                  <b>{messages.length}</b>
                </div>
                <div className="kv">
                  <span className="k">Maya</span>
                  <b>{selected.ai_enabled ? "On" : "Paused"}</b>
                </div>
              </div>
            </div>

            {orders.length > 0 && (
              <div className="ctx-sec">
                <div className="ctx-label">
                  {pendingOrder ? "Booked by Maya, waiting for you" : "Orders"}
                </div>
                {orders.slice(0, 3).map((o) => (
                  <div className={`order-card ${o.status === "pending" ? "pending" : ""}`} key={o.id}>
                    <div className="order-top">
                      <span className="order-no">Order #{o.order_number}</span>
                      <span
                        className={`pill ${
                          o.status === "pending" ? "amber" : o.status === "confirmed" ? "green" : ""
                        }`}
                      >
                        {o.status === "pending" ? "To confirm" : o.status === "confirmed" ? "Confirmed" : "Cancelled"}
                      </span>
                    </div>
                    {(o.items as OrderItem[]).map((it, i) => (
                      <div className="order-line" key={i}>
                        <span>
                          {it.name}
                          <span className="sku">{it.sku}</span>
                          {it.quantity > 1 && <span className="sku">×{it.quantity}</span>}
                        </span>
                        <b>{npr(it.unit_price * it.quantity)}</b>
                      </div>
                    ))}
                    <div className="order-line total">
                      <span>Total</span>
                      <b>{npr(Number(o.total))}</b>
                    </div>
                    {(o.delivery_address || o.phone) && (
                      <div className="order-ship">
                        {o.delivery_address && <span>{o.delivery_address}</span>}
                        {o.phone && <span className="num">{o.phone}</span>}
                      </div>
                    )}
                    {customerCheckLine(o) && <div className="order-cust">{customerCheckLine(o)}</div>}
                    {o.status === "pending" && (
                      <div className="order-actions">
                        <button
                          className="btn primary block"
                          disabled={busy}
                          onClick={() => decideOrder(o.id, "confirmed")}
                        >
                          Confirm Order
                        </button>
                        <button
                          className="btn ghost"
                          disabled={busy}
                          onClick={() => decideOrder(o.id, "cancelled")}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {pendingDraft && (
              <div className="ctx-sec">
                <div className="ctx-label">Why Maya held this</div>
                <div className="srcs">
                  <div className="src-row">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v4" />
                      <path d="M12 16h.01" />
                    </svg>
                    <div>
                      Discounts, complaints and anything she isn&rsquo;t sure about always go to
                      you first.
                    </div>
                  </div>
                </div>
                {pendingDraft.ai_confidence !== null && (
                  <div className="conf">
                    <div className="conf-row">
                      <span>Draft confidence</span>
                      <b>{Math.round(pendingDraft.ai_confidence * 100)}%</b>
                    </div>
                    <div className="conf-bar">
                      <i style={{ width: `${Math.round(pendingDraft.ai_confidence * 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {latestTriage && (
              <div className="ctx-sec">
                <div className="ctx-label">Last message</div>
                <div className="sig-intent">
                  {INTENT_LABEL[latestTriage.intent] ?? latestTriage.intent}
                  <span>{Math.round(latestTriage.intentConfidence * 100)}% sure</span>
                </div>
                <div className="mood-row">
                  <span>Frustration</span>
                  <b>{Math.round((latestTriage.frustration / 2) * 100)}%</b>
                </div>
                <div className="mood-bar heat">
                  <i style={{ width: `${Math.max(2, Math.round((latestTriage.frustration / 2) * 100))}%` }} />
                </div>
                <div className="mood-row">
                  <span>Warmth</span>
                  <b>{Math.round((latestTriage.warmth / 2) * 100)}%</b>
                </div>
                <div className="mood-bar warm">
                  <i style={{ width: `${Math.max(2, Math.round((latestTriage.warmth / 2) * 100))}%` }} />
                </div>
                <div className="mood-row">
                  <span>Owner should answer</span>
                  <b>{Math.round(latestTriage.needsHuman * 100)}%</b>
                </div>
                <div className="mood-bar human">
                  <i style={{ width: `${Math.max(2, Math.round(latestTriage.needsHuman * 100))}%` }} />
                </div>
                <div className="sig-foot">
                  {latestTriage.model} · {latestTriage.latencyMs}ms
                </div>
              </div>
            )}

            <div className="ctx-sec">
              <div className="ctx-label">Actions</div>
              <div className="qa">
                <button onClick={() => patchConversation({ status: "resolved" }, "Marked as handled")}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Mark as Handled
                </button>
                <button
                  onClick={() =>
                    patchConversation({ ai_enabled: false }, "You have taken over. Maya is paused here.")
                  }
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21a8 8 0 0 1 16 0" />
                  </svg>
                  Take Over This Chat
                </button>
                <button
                  className="warn"
                  onClick={() =>
                    patchConversation({ ai_enabled: false }, "Maya won't auto-reply to this customer")
                  }
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="m5.6 5.6 12.8 12.8" />
                  </svg>
                  Never Auto-reply Here
                </button>
              </div>
            </div>
          </>
        )}
      </aside>

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {toast}
      </div>
    </section>
  );
}
