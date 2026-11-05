"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import Avatar from "@/components/phone/Avatar";
import {
  ATTACHMENT_BODY,
  CHANNEL_LABEL,
  clockTime,
  dayLabel,
  moodOf,
  nameOf,
  productPhoto,
  type PhoneConversation,
} from "@/components/phone/chat";
import { npr } from "@/components/phone/format";
import { usePoll } from "@/components/phone/usePoll";
import type { Message, Order } from "@/lib/types";

interface ThreadData {
  messages: Message[];
  orders: Order[];
  conversation: PhoneConversation | null;
  photos: Record<string, string>;
}

/**
 * One conversation, laid out like the messaging apps the owner already uses:
 * customer on the left, Maya and the owner on the right, the composer pinned
 * above the keyboard.
 */
export default function ChatThread({ id }: { id: string }) {
  const router = useRouter();
  const { data, reload } = usePoll<ThreadData>(`/api/conversations/${id}/messages`, 3000);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busyOrder, setBusyOrder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const lastCount = useRef(0);
  const vvh = useVisualViewportHeight();

  const conv = data?.conversation ?? null;
  const messages = data?.messages ?? [];
  const pendingOrder = data?.orders.find((o) => o.status === "pending") ?? null;
  const channel = conv?.channel_connections?.channel ?? null;
  const mood = conv ? moodOf(conv) : null;

  // Stay pinned to the newest message unless the owner has scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || messages.length === lastCount.current) return;
    const first = lastCount.current === 0;
    lastCount.current = messages.length;
    if (first || stick.current) el.scrollTo({ top: el.scrollHeight, behavior: first ? "auto" : "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [vvh]);

  // A photo finishing loading grows the thread; keep the newest message in view.
  const followBottom = () => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight });
  };

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  };

  const back = () => (window.history.length > 1 ? router.back() : router.push("/m/chats"));

  const send = async (body: { text?: string; approveDraftId?: string }) => {
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) flash("Saved, but it didn't reach the customer");
      else navigator.vibrate?.(10);
      if (body.text) setText("");
      stick.current = true;
      await reload();
    } catch {
      flash("Couldn't reach Myna. Try again.");
    } finally {
      setSending(false);
    }
  };

  const patch = async (p: { ai_enabled?: boolean; status?: "open" | "resolved" }, note: string) => {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    flash(note);
    await reload();
  };

  const confirmOrder = async (order: Order) => {
    setBusyOrder(true);
    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "confirmed" }),
    }).catch(() => null);
    setBusyOrder(false);
    if (res?.ok) {
      navigator.vibrate?.(18);
      flash(`Order #${order.order_number} confirmed. ${conv ? nameOf(conv) : "The customer"} has been told.`);
    } else flash("Couldn't confirm. Open the order and try again.");
    await reload();
  };

  return (
    <div className="ph ph-thread" style={vvh ? { height: vvh } : undefined}>
      <header className="ph-top bar thread">
        <button className="ph-back" onClick={back} aria-label="Back to chats">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        {conv ? (
          <div className="ph-thread-who">
            <Avatar who={conv} channel={channel} size={36} />
            <span className="ph-thread-id">
              <b>{nameOf(conv)}</b>
              <span>
                {channel ? CHANNEL_LABEL[channel] : "DM"}
                {mood ? ` · ${mood.label}` : ""}
              </span>
            </span>
          </div>
        ) : (
          <span />
        )}
        {conv && (
          <button
            className={`ph-maya-toggle ${conv.ai_enabled ? "on" : ""}`}
            onClick={() =>
              patch(
                { ai_enabled: !conv.ai_enabled },
                conv.ai_enabled ? "Maya is paused here. You're replying." : "Maya is back on this chat.",
              )
            }
            aria-pressed={conv.ai_enabled}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3l2.2 6.6L21 12l-6.8 2.4L12 21l-2.2-6.6L3 12l6.8-2.4z" />
            </svg>
            {conv.ai_enabled ? "Maya on" : "Maya off"}
          </button>
        )}
      </header>

      {conv?.status === "needs_human" && (
        <div className="ph-banner amber">
          <span>Maya handed this chat to you.</span>
          <button className="ph-btn small" onClick={() => patch({ status: "resolved" }, "Marked as done")}>
            Mark done
          </button>
        </div>
      )}
      {pendingOrder && (
        <div className="ph-banner order">
          <Link href={`/orders/${pendingOrder.id}`} className="ph-banner-text">
            <b className="num">Order #{pendingOrder.order_number}</b>
            <span className="num">
              {pendingOrder.items.map((i) => i.name).join(", ")} · {npr(Number(pendingOrder.total))}
            </span>
          </Link>
          <button className="ph-btn small primary-sm" disabled={busyOrder} onClick={() => confirmOrder(pendingOrder)}>
            {busyOrder ? "…" : "Confirm"}
          </button>
        </div>
      )}

      <div
        className="ph-msgs"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        aria-live="polite"
      >
        {!data && <div className="ph-day">Loading…</div>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
          const side = m.direction === "inbound" ? "in" : "out";
          const sameAsNext =
            next && next.direction === m.direction && next.sender_type === m.sender_type && next.status !== "draft_pending";
          const showWho = side === "out" && (!prev || prev.direction !== "outbound" || prev.sender_type !== m.sender_type || newDay);
          return (
            <Fragment key={m.id}>
              {newDay && <div className="ph-day">{dayLabel(m.created_at)}</div>}
              {m.status === "draft_pending" ? (
                <div className="ph-draft">
                  <div className="ph-draft-tag">Maya drafted this. Send it?</div>
                  <div className="ph-bubble out draft">{m.body}</div>
                  <div className="ph-draft-actions">
                    <button className="ph-btn small primary-sm" disabled={sending} onClick={() => send({ approveDraftId: m.id })}>
                      Send
                    </button>
                    <button
                      className="ph-btn small"
                      onClick={() => {
                        setText(m.body);
                        input.current?.focus();
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`ph-row ${side} ${sameAsNext ? "grouped" : ""}`}>
                  {showWho && (
                    <span className={`ph-who ${m.sender_type}`}>
                      {m.sender_type === "ai" ? "Maya" : "You"}
                    </span>
                  )}
                  <Bubble m={m} side={side} photos={data?.photos ?? {}} onMedia={followBottom} />
                  {!sameAsNext && (
                    <span className="ph-stamp">
                      {clockTime(m.created_at)}
                      {m.status === "failed" ? " · Not delivered" : ""}
                    </span>
                  )}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <form
        className="ph-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() && !sending) send({ text: text.trim() });
        }}
      >
        <textarea
          ref={input}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={conv?.ai_enabled ? "Reply yourself (Maya is on)" : "Message"}
          enterKeyHint="send"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" className="ph-send" disabled={!text.trim() || sending} aria-label="Send">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </form>

      {toast && (
        <div className="ph-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Bubble({
  m,
  side,
  photos,
  onMedia,
}: {
  m: Message;
  side: "in" | "out";
  photos: Record<string, string>;
  onMedia: () => void;
}) {
  const product = side === "out" ? productPhoto(m.body) : null;
  if (product) {
    const src = photos[product.sku];
    return (
      <figure className="ph-photo out">
        {src && <img src={src} alt="" onLoad={onMedia} />}
        <figcaption className="num">{product.caption}</figcaption>
      </figure>
    );
  }
  if (side === "in" && m.media?.kind === "image") {
    const caption = m.body && m.body !== "Shared a photo" ? m.body : null;
    return (
      <figure className="ph-photo in">
        <img src={`/api/media/${m.id}`} alt="Photo from the customer" onLoad={onMedia} />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    );
  }
  if (ATTACHMENT_BODY.test(m.body)) {
    return <div className={`ph-bubble ${side} attach`}>{m.body}</div>;
  }
  return <div className={`ph-bubble ${side} ${m.sender_type} ${m.status === "failed" ? "failed" : ""}`}>{m.body}</div>;
}

/**
 * The height left above the keyboard. iOS doesn't shrink the layout viewport
 * for the keyboard, so the thread sizes itself to the visual viewport instead.
 */
function useVisualViewportHeight(): number | null {
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setH(Math.round(vv.height));
      // iOS scrolls the page up under the keyboard; keep the header on screen.
      window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);
  return h;
}
