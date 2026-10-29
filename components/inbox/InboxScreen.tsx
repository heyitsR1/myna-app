"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { AiSource, Channel, Conversation, Message, Order, OrderItem } from "@/lib/types";

interface InboxConversation extends Conversation {
  channel_connections: { channel: Channel; external_account_id: string } | null;
  messages: Pick<Message, "body" | "created_at" | "sender_type" | "direction" | "status">[];
  orders: Pick<Order, "id" | "status" | "order_number" | "total">[];
}

function npr(amount: number): string {
  return `Rs ${Math.round(amount).toLocaleString("en-IN")}`;
}

type Filter = "all" | "instagram" | "whatsapp" | "messenger" | "needs";

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
  if (heat !== null && heat >= 1.5) return { cls: "angry", label: "😠 Upset" };
  if (heat !== null && heat >= 1.0) return { cls: "impatient", label: "⏳ Impatient" };
  if (warm !== null && warm >= 1.5) return { cls: "happy", label: "💛 Happy" };
  return null;
}

const INTENT_LABEL: Record<string, string> = {
  question: "Question",
  catalogue: "Wants the list",
  buy: "Wants to buy",
  complaint: "Complaint",
  negotiation: "Wants a discount",
  thanks: "Thank you",
  other: "Other",
};

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [composerText, setComposerText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
    const kick = window.setTimeout(loadInbox, 0);
    const poll = window.setInterval(() => {
      loadInbox();
      if (selectedIdRef.current) loadMessages(selectedIdRef.current);
    }, 10000);

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
  }, [loadInbox, loadMessages]);

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
      return c.channel_connections?.channel === filter;
    });
  }, [conversations, filter]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const needsCount = conversations.filter((c) => c.status === "needs_human").length;
  const aiCount = conversations.filter(
    (c) => c.messages[0]?.sender_type === "ai" && c.messages[0]?.status === "sent",
  ).length;
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
        showToast(status === "confirmed" ? `Order confirmed — ${displayName(selected)} has been told` : "Order cancelled — customer notified");
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
        showToast(`Sent to ${displayName(selected)} — Maya keeps watching this thread`);
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
          <svg viewBox="0 0 24 24">
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5.4 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.1z" />
          </svg>
          <div className="big">Connect Supabase to open your inbox</div>
          <div className="fine">
            Copy <code>.env.example</code> to <code>.env.local</code>, fill in your
            Supabase URL and keys, run the migration in{" "}
            <code>supabase/migrations</code>, then restart the dev server. The full
            walkthrough lives in <code>SETUP.md</code>.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="screen">
      {/* ── conversation list ── */}
      <div className="col-list">
        <div className="list-head">
          <div className="page-title">Inbox</div>
          <div className="h-sub">All channels · One current</div>
          {conversations.length > 0 && (
            <div className="digest">
              <span className="dot" />
              <span>
                <b>{conversations.length}</b> conversation
                {conversations.length === 1 ? "" : "s"} · {aiCount} Maya-replied ·{" "}
                {needsCount} need you
              </span>
            </div>
          )}
        </div>
        <div className="chips">
          {(
            [
              ["all", "All"],
              ["whatsapp", "WhatsApp"],
              ["instagram", "Instagram"],
              ["messenger", "Facebook"],
              ["needs", "Needs you"],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              className={`chip ${filter === value ? "active" : ""}`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="convos">
          {visible.length === 0 ? (
            <div className="empty">
              <div className="big">Quiet in here</div>
              <div className="fine">
                {conversations.length === 0
                  ? "No conversations yet. Connect Instagram on the Channels page and send your test account a DM — it will land here."
                  : "Nothing matches this filter."}
              </div>
            </div>
          ) : (
            visible.map((conv) => {
              const ch = conv.channel_connections?.channel ?? "instagram";
              const last = conv.messages[0];
              const m = mood(conv);
              return (
                <button
                  key={conv.id}
                  className={`convo ${conv.id === selectedId ? "sel" : ""}`}
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
                    <i className={CHANNEL_DOT[ch]} />
                  </div>
                  <div className="c-body">
                    <div className="c-top">
                      <span className="c-name">{displayName(conv)}</span>
                      <span className="c-time">
                        {formatTime(conv.last_message_at ?? conv.created_at)}
                      </span>
                    </div>
                    <div className="c-snip">{last?.body ?? "…"}</div>
                    {m && <span className={`tag ${m.cls}`}>{m.label}</span>}
                    {conv.orders?.some((o) => o.status === "pending") ? (
                      <span className="tag order">🧾 Order to confirm</span>
                    ) : conv.status === "needs_human" ? (
                      <span className="tag needs">⚠ Needs you</span>
                    ) : last?.sender_type === "ai" ? (
                      <span className="tag maya">✓ Maya replied</span>
                    ) : last?.sender_type === "human" ? (
                      <span className="tag you">You replied</span>
                    ) : null}
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
            <svg viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <div className="big">Pick a conversation</div>
            <div className="fine">
              Threads from Instagram, WhatsApp and Facebook open here — with
              Maya&apos;s drafts held for your approval when she isn&apos;t sure.
            </div>
          </div>
        ) : (
          <>
            <div className="t-head">
              <div className="ava" style={{ width: 40, height: 40 }}>
                {initials(selected)}
                <i
                  className={
                    CHANNEL_DOT[selected.channel_connections?.channel ?? "instagram"]
                  }
                />
              </div>
              <div>
                <div className="t-name">{displayName(selected)}</div>
                <div className="t-meta">
                  <span
                    className="ch-ico"
                    style={{
                      background:
                        CHANNEL_COLOR[
                          selected.channel_connections?.channel ?? "instagram"
                        ],
                    }}
                  />
                  {CHANNEL_LABEL[selected.channel_connections?.channel ?? "instagram"]}
                  {" · "}
                  {selected.status === "needs_human"
                    ? "Needs you"
                    : selected.status === "resolved"
                      ? "Resolved"
                      : "Open"}
                </div>
              </div>
              <div className="t-actions">
                <button
                  className={`maya-toggle ${selected.ai_enabled ? "" : "off"}`}
                  onClick={() =>
                    patchConversation(
                      { ai_enabled: !selected.ai_enabled },
                      selected.ai_enabled
                        ? "Maya paused for this thread"
                        : "Maya back on for this thread",
                    )
                  }
                >
                  MAYA {selected.ai_enabled ? "ON" : "OFF"} <span className="switch" />
                </button>
              </div>
            </div>

            <div className="thread" ref={threadRef}>
              {messages.length === 0 && (
                <div className="day">Loading conversation…</div>
              )}
              {messages.map((m) =>
                m.status === "draft_pending" ? (
                  <div className="draft" key={m.id}>
                    <div className="draft-tag">
                      ◔ DRAFTED BY MAYA · HELD FOR APPROVAL
                    </div>
                    <div className="draft-bubble">{m.body}</div>
                    {(m.ai_sources?.length ?? 0) > 0 && (
                      <div className="draft-src">
                        SOURCES{" "}
                        {(m.ai_sources as AiSource[]).slice(0, 2).map((s, i) => (
                          <span className="src-chip" key={i}>
                            Brand doc · {Math.round(s.similarity * 100)}% match
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="draft-actions">
                      <button
                        className="btn primary"
                        disabled={busy}
                        onClick={() => approveDraft(m.id)}
                      >
                        Approve &amp; send
                      </button>
                      <button
                        className="btn ghost"
                        onClick={() => setComposerText(m.body)}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} style={{ display: "contents" }}>
                    {m.sender_type === "ai" && m.status === "sent" && (
                      <div className="sentline">✓ MAYA · AUTO-SENT</div>
                    )}
                    <div
                      className={`msg ${m.direction === "inbound" ? "in" : "out"} ${
                        m.status === "failed" ? "failed" : ""
                      }`}
                    >
                      {m.body}
                    </div>
                    <div
                      className={`stamp ${m.direction === "inbound" ? "" : "right"}`}
                    >
                      {formatTime(m.created_at)}
                      {m.status === "failed" ? " · failed to send" : ""}
                    </div>
                  </div>
                ),
              )}
            </div>

            <div className="composer">
              <input
                type="text"
                placeholder="Reply as yourself — Maya steps aside when you type…"
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendReply();
                }}
              />
              <button
                className="send"
                aria-label="Send"
                disabled={busy || !composerText.trim()}
                onClick={sendReply}
              >
                <svg viewBox="0 0 24 24">
                  <path d="m22 2-7 20-4-9-9-4z" />
                  <path d="M22 2 11 13" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── context panel ── */}
      <aside className="col-ctx">
        {!selected ? (
          <div className="ctx-card">
            <div className="ctx-label">Context</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
              Customer details, Maya&apos;s sources and her confidence appear here
              once you open a conversation.
            </div>
          </div>
        ) : (
          <>
            <div className="ctx-card">
              <div className="ctx-label">Customer</div>
              <div className="cust">
                <div className="ava" style={{ width: 46, height: 46 }}>
                  {initials(selected)}
                  <i
                    className={
                      CHANNEL_DOT[selected.channel_connections?.channel ?? "instagram"]
                    }
                  />
                </div>
                <div>
                  <div className="cust-name">{displayName(selected)}</div>
                  <div className="cust-meta">
                    ID ·{selected.external_customer_id.slice(-8)}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div className="kv">
                  <span className="k">First seen</span>
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

            {latestTriage && (
              <div className="ctx-card">
                <div className="ctx-label">How this message reads</div>
                <span className="mood-intent">
                  {INTENT_LABEL[latestTriage.intent] ?? latestTriage.intent} ·{" "}
                  {Math.round(latestTriage.intentConfidence * 100)}%
                </span>
                <div className="mood-row">
                  <span>FRUSTRATION</span>
                  <b>{latestTriage.frustration.toFixed(2)} / 2</b>
                </div>
                <div className="mood-bar heat">
                  <i style={{ width: `${Math.round((latestTriage.frustration / 2) * 100)}%` }} />
                </div>
                <div className="mood-row">
                  <span>WARMTH</span>
                  <b>{latestTriage.warmth.toFixed(2)} / 2</b>
                </div>
                <div className="mood-bar warm">
                  <i style={{ width: `${Math.round((latestTriage.warmth / 2) * 100)}%` }} />
                </div>
                <div className="mood-row">
                  <span>OWNER SHOULD ANSWER</span>
                  <b>{Math.round(latestTriage.needsHuman * 100)}%</b>
                </div>
                <div className="pg" style={{ marginTop: 10 }}>
                  {latestTriage.model} · {latestTriage.tokens} tokens · {latestTriage.latencyMs}ms
                </div>
              </div>
            )}

            {orders.length > 0 && (
              <div className="ctx-card">
                <div className="ctx-label">
                  {pendingOrder ? "Order booked by Maya · needs your OK" : "Orders"}
                </div>
                {orders.slice(0, 3).map((o) => (
                  <div className="order" key={o.id}>
                    <div className="order-top">
                      <b>#{o.order_number}</b>
                      <span className={`order-status ${o.status}`}>{o.status}</span>
                    </div>
                    {(o.items as OrderItem[]).map((it, i) => (
                      <div className="order-line" key={i}>
                        <span>
                          {it.name} <span className="pg">{it.sku}</span> × {it.quantity}
                        </span>
                        <b>{npr(it.unit_price * it.quantity)}</b>
                      </div>
                    ))}
                    <div className="order-line total">
                      <span>Total</span>
                      <b>{npr(Number(o.total))}</b>
                    </div>
                    {(o.delivery_address || o.phone) && (
                      <div className="pg" style={{ marginTop: 6 }}>
                        {[o.delivery_address, o.phone].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {o.status === "pending" && (
                      <div className="draft-actions" style={{ marginTop: 10 }}>
                        <button className="btn primary" disabled={busy} onClick={() => decideOrder(o.id, "confirmed")}>
                          Confirm order
                        </button>
                        <button className="btn ghost" disabled={busy} onClick={() => decideOrder(o.id, "cancelled")}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {pendingDraft && (
              <div className="ctx-card">
                <div className="ctx-label">Why Maya held this one</div>
                <div className="srcs">
                  <div className="src-row">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    <div>
                      Confidence below the auto-send bar, or the message touched
                      money, complaints or something outside the brand documents.
                      <div className="pg">rule: unsure or sensitive → hold</div>
                    </div>
                  </div>
                  {(pendingDraft.ai_sources as AiSource[] | null)
                    ?.slice(0, 2)
                    .map((s, i) => (
                      <div className="src-row" key={i}>
                        <svg viewBox="0 0 24 24">
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                        <div>
                          {s.excerpt.slice(0, 70)}…
                          <div className="pg">brand doc</div>
                        </div>
                      </div>
                    ))}
                </div>
                {pendingDraft.ai_confidence !== null && (
                  <div className="conf">
                    <div className="conf-row">
                      <span>DRAFT CONFIDENCE</span>
                      <b>{Math.round(pendingDraft.ai_confidence * 100)}%</b>
                    </div>
                    <div className="conf-bar">
                      <i
                        style={{
                          width: `${Math.round(pendingDraft.ai_confidence * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="ctx-card">
              <div className="ctx-label">Quick actions</div>
              <div className="qa">
                <button
                  onClick={() =>
                    patchConversation({ status: "resolved" }, "Marked handled")
                  }
                >
                  ✓ &nbsp;Mark handled
                </button>
                <button
                  onClick={() =>
                    patchConversation(
                      { ai_enabled: false },
                      "You've taken over — Maya paused here",
                    )
                  }
                >
                  👤 &nbsp;Take over — pause Maya here
                </button>
                <button
                  className="warn"
                  onClick={() =>
                    patchConversation(
                      { ai_enabled: false },
                      "Maya will never auto-reply to this customer",
                    )
                  }
                >
                  ✕ &nbsp;Never auto-reply to this customer
                </button>
              </div>
            </div>
          </>
        )}
      </aside>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </section>
  );
}
