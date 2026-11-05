"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "@/components/phone/Avatar";
import { boughtCount } from "@/components/phone/CustomersScreen";
import { CHANNEL_LABEL } from "@/components/phone/chat";
import { npr, type PhoneOrder } from "@/components/phone/format";
import OrderRow from "@/components/phone/OrderRow";
import { usePoll } from "@/components/phone/usePoll";
import type { Customer } from "@/app/api/customers/route";

const SUGGESTED_TAGS = ["VIP", "Follow up", "Wholesale", "Gift buyer", "Rider"];

/** One customer's card: who they are, what they bought, and the owner's private note. */
export default function CustomerDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data, at: now, reload } = usePoll<{ customers?: Customer[] }>("/api/customers", 20000);
  const c = data?.customers?.find((x) => x.key === id) ?? null;
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 1800);
    return () => clearTimeout(t);
  }, [saved]);

  const save = async (patch: { notes?: string; tags?: string[] }) => {
    if (!c?.primaryConversationId) return;
    const res = await fetch(`/api/conversations/${c.primaryConversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    setSaved(res?.ok ? "Saved" : "Couldn't save");
    await reload();
  };

  const toggleTag = (tag: string) => {
    if (!c) return;
    navigator.vibrate?.(8);
    save({ tags: c.tags.includes(tag) ? c.tags.filter((t) => t !== tag) : [...c.tags, tag] });
  };

  const back = () => (window.history.length > 1 ? router.back() : router.push("/m/customers"));

  if (data && !c) {
    return (
      <div className="ph">
        <main className="ph-main">
          <div className="ph-empty">
            <div>
              <div className="ph-empty-title">Customer not found</div>
              <Link href="/m/customers" className="ph-btn small" style={{ marginTop: 12 }}>
                All customers
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const n = c ? boughtCount(c) : 0;
  const editable = Boolean(c?.primaryConversationId);
  const noteValue = note ?? c?.notes ?? "";

  return (
    <div className="ph">
      <header className="ph-top bar">
        <button className="ph-back" onClick={back} aria-label="Back to customers">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Customers
        </button>
        <span />
        <span className="ph-saved" role="status">
          {saved}
        </span>
      </header>
      <main className="ph-main">
        {!c ? (
          <div className="ph-skeleton" aria-hidden="true">
            <span />
            <span />
          </div>
        ) : (
          <>
            <section className="ph-cust-hero">
              <Avatar
                who={{ customer_name: c.name, external_customer_id: c.external_customer_id }}
                channel={c.channels[0] === "website" ? null : c.channels[0]}
                size={72}
              />
              <h1 className="ph-cust-name">{c.name}</h1>
              <div className="ph-cust-sub">
                {c.channels.map((ch) => (ch === "website" ? "Website" : CHANNEL_LABEL[ch])).join(" · ")} · customer since{" "}
                {new Date(c.firstSeen).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </div>
              <div className="ph-cust-actions">
                {c.conversations.map((conv) => (
                  <Link key={conv.id} href={`/m/chats/${conv.id}`} className="ph-btn small primary-sm">
                    Message on {CHANNEL_LABEL[conv.channel as keyof typeof CHANNEL_LABEL] ?? "DM"}
                  </Link>
                ))}
                {c.phone && (
                  <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="ph-btn small">
                    Call
                  </a>
                )}
              </div>
            </section>

            <div className="ph-kpis card">
              <div>
                <b className="num">{n}</b>
                <span>orders</span>
              </div>
              <div>
                <b className="num">{npr(c.spent)}</b>
                <span>spent</span>
              </div>
              <div>
                <b className="num">{n ? npr(c.spent / n) : "—"}</b>
                <span>avg order</span>
              </div>
            </div>

            <section className="ph-sec">
              <h2 className="ph-label">Details</h2>
              <dl className="ph-facts">
                <div>
                  <dt>Phone</dt>
                  <dd>{c.phone ?? <span className="ph-missing">Not given yet</span>}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{c.address ?? <span className="ph-missing">Not given yet</span>}</dd>
                </div>
                <div>
                  <dt>Last seen</dt>
                  <dd>{new Date(c.lastSeen).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</dd>
                </div>
              </dl>
            </section>

            {editable && (
              <section className="ph-sec">
                <h2 className="ph-label">Tags</h2>
                <div className="ph-tagset">
                  {[...new Set([...SUGGESTED_TAGS, ...c.tags])].map((t) => (
                    <button
                      key={t}
                      className={`ph-chip ${c.tags.includes(t) ? "on" : ""}`}
                      aria-pressed={c.tags.includes(t)}
                      onClick={() => toggleTag(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {editable && (
              <section className="ph-sec">
                <h2 className="ph-label">Private note</h2>
                <textarea
                  className="ph-note-box"
                  rows={3}
                  placeholder="Only you see this. e.g. prefers evening delivery, bought for her brother"
                  value={noteValue}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => note !== null && note !== (c.notes ?? "") && save({ notes: note })}
                  enterKeyHint="done"
                />
              </section>
            )}

            <section className="ph-sec">
              <h2 className="ph-label">Orders</h2>
              {c.orders.length === 0 ? (
                <p className="ph-empty-sub">No orders yet. Maya will book one when they&apos;re ready.</p>
              ) : (
                <ul className="ph-list">
                  {c.orders.map((o, i) => (
                    <OrderRow
                      key={o.id}
                      order={
                        {
                          ...o,
                          conversations: {
                            customer_name: c.name,
                            channel_connections: {
                              channel: c.conversations.find((x) => x.id === o.conversation_id)?.channel ?? null,
                            },
                          },
                        } as unknown as PhoneOrder
                      }
                      now={now}
                      index={i}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
