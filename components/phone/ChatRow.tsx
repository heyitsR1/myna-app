import Link from "next/link";
import Avatar from "@/components/phone/Avatar";
import { moodOf, nameOf, type PhoneConversation } from "@/components/phone/chat";
import { ago } from "@/components/phone/format";

export default function ChatRow({ c, now, index }: { c: PhoneConversation; now: number; index: number }) {
  const last = c.messages?.[0];
  const needs = c.status === "needs_human";
  const pendingOrder = c.orders?.find((o) => o.status === "pending");
  const mood = moodOf(c);
  const who = last
    ? last.status === "draft_pending"
      ? "Draft: "
      : last.sender_type === "ai"
        ? "Maya: "
        : last.sender_type === "human"
          ? "You: "
          : ""
    : "";

  return (
    <li style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
      <Link href={`/m/chats/${c.id}`} className={`ph-chat ${needs ? "needs" : ""}`}>
        <Avatar who={c} channel={c.channel_connections?.channel} />
        <span className="ph-chat-body">
          <span className="ph-chat-top">
            <span className="ph-chat-name">{nameOf(c)}</span>
            <span className="ph-chat-time">{ago(c.last_message_at, now)}</span>
          </span>
          <span className="ph-chat-preview">
            <span className="ph-chat-who">{who}</span>
            {last?.body ?? "No messages yet"}
          </span>
          {(needs || pendingOrder || mood || !c.ai_enabled) && (
            <span className="ph-chat-tags">
              {needs && <span className="pill amber">Needs you</span>}
              {pendingOrder && <span className="pill plain num">Order #{pendingOrder.order_number}</span>}
              {mood && <span className={`pill ${mood.cls}`}>{mood.label}</span>}
              {!c.ai_enabled && <span className="pill plain">Maya off</span>}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
