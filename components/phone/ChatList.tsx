"use client";

import { useState } from "react";
import ChatRow from "@/components/phone/ChatRow";
import { nameOf, type PhoneConversation } from "@/components/phone/chat";
import { usePoll } from "@/components/phone/usePoll";

type Filter = "all" | "needs" | "instagram" | "whatsapp" | "messenger";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs", label: "Needs you" },
  { key: "instagram", label: "Instagram" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "messenger", label: "Messenger" },
];

export default function ChatList() {
  const { data, at: now } = usePoll<{ conversations?: PhoneConversation[] }>("/api/inbox", 5000);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const all = data?.conversations ?? null;
  const needs = (all ?? []).filter((c) => c.status === "needs_human").length;
  const list = (all ?? []).filter((c) => {
    if (filter === "needs" && c.status !== "needs_human") return false;
    if (filter !== "all" && filter !== "needs" && c.channel_connections?.channel !== filter) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return nameOf(c).toLowerCase().includes(needle) || (c.messages?.[0]?.body ?? "").toLowerCase().includes(needle);
  });

  return (
    <div className="ph">
      <header className="ph-top stack">
        <h1 className="ph-top-large">Chats</h1>
        <label className="ph-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <input
            type="search"
            placeholder="Search customers or messages"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="search"
            autoCorrect="off"
          />
        </label>
        <div className="ph-chips" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              className={`ph-chip ${filter === f.key ? "on" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {f.key === "needs" && needs > 0 && <span className="ph-chip-n num">{needs}</span>}
            </button>
          ))}
        </div>
      </header>
      <main className="ph-main with-tabs flush">
        {all === null ? (
          <div className="ph-skeleton pad" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : list.length === 0 ? (
          <div className="ph-empty pad">
            <div>
              <div className="ph-empty-title">{q ? "No matches" : "No chats here"}</div>
              <div className="ph-empty-sub">DMs from every channel land in this list.</div>
            </div>
          </div>
        ) : (
          <ul className="ph-chats" key={filter}>
            {list.map((c, i) => (
              <ChatRow key={c.id} c={c} now={now} index={i} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
