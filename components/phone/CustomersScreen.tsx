"use client";

import Link from "next/link";
import { useState } from "react";
import Avatar from "@/components/phone/Avatar";
import { ago, areaOf, npr } from "@/components/phone/format";
import { usePoll } from "@/components/phone/usePoll";
import type { Customer } from "@/app/api/customers/route";

type Filter = "all" | "buyers" | "repeat" | "needs" | "browsing";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "buyers", label: "Bought" },
  { key: "repeat", label: "Repeat" },
  { key: "browsing", label: "Just looking" },
  { key: "needs", label: "Needs you" },
];

export function boughtCount(c: Customer): number {
  return c.orders.filter((o) => o.status !== "cancelled").length;
}

/** The owner's customer book: everyone who has DMed or ordered, newest first. */
export default function CustomersScreen() {
  const { data, at: now } = usePoll<{ customers?: Customer[] }>("/api/customers", 15000);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const all = data?.customers ?? null;

  const list = (all ?? []).filter((c) => {
    const n = boughtCount(c);
    if (filter === "buyers" && n === 0) return false;
    if (filter === "repeat" && n < 2) return false;
    if (filter === "browsing" && n > 0) return false;
    if (filter === "needs" && !c.needsYou) return false;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return [c.name, c.phone, c.address, c.notes, ...c.tags].some((v) => v?.toLowerCase().includes(needle));
  });

  const buyers = (all ?? []).filter((c) => boughtCount(c) > 0);
  const repeat = buyers.filter((c) => boughtCount(c) > 1).length;
  const revenue = (all ?? []).reduce((s, c) => s + c.spent, 0);

  return (
    <div className="ph">
      <header className="ph-top stack">
        <h1 className="ph-top-large">Customers</h1>
        <label className="ph-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <input
            type="search"
            placeholder="Name, phone, area, note or tag"
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
            </button>
          ))}
        </div>
      </header>
      <main className="ph-main with-tabs flush">
        {all && (
          <div className="ph-kpis">
            <div>
              <b className="num">{all.length}</b>
              <span>people</span>
            </div>
            <div>
              <b className="num">{buyers.length}</b>
              <span>bought</span>
            </div>
            <div>
              <b className="num">{repeat}</b>
              <span>came back</span>
            </div>
            <div>
              <b className="num">{npr(revenue)}</b>
              <span>lifetime</span>
            </div>
          </div>
        )}
        {all === null ? (
          <div className="ph-skeleton pad" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : list.length === 0 ? (
          <div className="ph-empty pad">
            <div>
              <div className="ph-empty-title">{q ? "No matches" : "Nobody here yet"}</div>
              <div className="ph-empty-sub">Everyone who DMs or orders gets a card here automatically.</div>
            </div>
          </div>
        ) : (
          <ul className="ph-chats" key={filter}>
            {list.map((c, i) => {
              const n = boughtCount(c);
              const area = areaOf(c.address);
              return (
                <li key={c.key} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                  <Link href={`/m/customers/${encodeURIComponent(c.key)}`} className="ph-chat">
                    <Avatar
                      who={{ customer_name: c.name, external_customer_id: c.external_customer_id }}
                      channel={c.channels[0] === "website" ? null : c.channels[0]}
                    />
                    <span className="ph-chat-body">
                      <span className="ph-chat-top">
                        <span className="ph-chat-name">{c.name}</span>
                        {c.spent > 0 && <span className="ph-cust-spent num">{npr(c.spent)}</span>}
                      </span>
                      <span className="ph-chat-preview">
                        {n > 0 ? `${n} order${n > 1 ? "s" : ""}` : "No orders yet"}
                        {area ? ` · ${area}` : ""} · seen {ago(c.lastSeen, now)}
                        {c.lastSeen && ago(c.lastSeen, now) !== "now" ? " ago" : ""}
                      </span>
                      {(c.tags.length > 0 || c.needsYou || n > 1 || c.channels.length > 1) && (
                        <span className="ph-chat-tags">
                          {c.needsYou && <span className="pill amber">Needs you</span>}
                          {n > 1 && <span className="pill green">Repeat</span>}
                          {c.channels.length > 1 && <span className="pill plain">{c.channels.length} channels</span>}
                          {c.tags.map((t) => (
                            <span key={t} className="pill plain">
                              {t}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
