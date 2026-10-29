"use client";

import { useEffect, useState } from "react";
import type { Channel } from "@/lib/types";

interface ConnectionRow {
  id: string;
  channel: Channel;
  external_account_id: string;
  status: string;
  token_expires_at: string | null;
  created_at: string;
}

interface ChannelsResponse {
  configured: boolean;
  connections: ConnectionRow[];
  devMode?: { envReady?: Record<Channel, boolean>; webhookConfigured: boolean };
}

const META = {
  instagram: {
    name: "Instagram",
    letter: "I",
    color: "var(--ig)",
    info: "DMs and story replies land in the inbox. Connect via the dev-mode token in .env.local, then subscribe the webhook — SETUP.md has the walkthrough.",
  },
  whatsapp: {
    name: "WhatsApp",
    letter: "W",
    color: "var(--wa)",
    info: "Business Cloud API. Messages land in the same inbox and Maya replies inside the 24-hour service window — free, because only business-initiated templates are billed.",
  },
  messenger: {
    name: "Facebook",
    letter: "f",
    color: "var(--fb)",
    info: "Page Messenger routes into the same inbox on the same webhook. Send goes through the Page access token — no extra cost.",
  },
} as const;

/** Which env vars light each channel up, shown when it is still dark. */
const ENV_HINT: Record<Channel, string> = {
  instagram: "SET IG_ACCESS_TOKEN + IG_ACCOUNT_ID IN .ENV.LOCAL",
  messenger: "SET FB_PAGE_ACCESS_TOKEN + FB_PAGE_ID IN .ENV.LOCAL",
  whatsapp: "SET WA_ACCESS_TOKEN + WA_PHONE_NUMBER_ID IN .ENV.LOCAL",
};

export default function ChannelsScreen() {
  const [data, setData] = useState<ChannelsResponse | null>(null);

  useEffect(() => {
    fetch("/api/channels")
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData({ configured: false, connections: [] }));
  }, []);

  const connectionFor = (channel: Channel) =>
    data?.connections.find((c) => c.channel === channel) ?? null;

  return (
    <section className="screen">
      <div className="ch">
        <div>
          <div className="page-title">Channels</div>
          <div className="h-sub">Every doorway to your shop · One inbox</div>
        </div>

        {data && !data.configured && (
          <div
            className="digest"
            style={{ maxWidth: 640, marginTop: 18, marginBottom: 0 }}
          >
            <span className="dot" />
            <span>
              Supabase isn&apos;t configured yet — copy <b>.env.example</b> to{" "}
              <b>.env.local</b> and follow <b>SETUP.md</b>, then connections appear
              here.
            </span>
          </div>
        )}

        <div className="ch-grid">
          {(Object.keys(META) as Channel[]).map((channel) => {
            const meta = META[channel];
            const conn = connectionFor(channel);
            const envReady = Boolean(data?.devMode?.envReady?.[channel]);
            const connected = Boolean(conn) || envReady;
            return (
              <div className="ch-card" key={channel}>
                <div className="ch-top">
                  <div className="ch-dot" style={{ background: meta.color }}>
                    {meta.letter}
                  </div>
                  <div>
                    <div className="ch-name">{meta.name}</div>
                    <div className="ch-handle">
                      {conn
                        ? `·${conn.external_account_id.slice(-8)}`
                        : envReady
                          ? "dev-mode token"
                          : "—"}
                    </div>
                  </div>
                  <span className={`ch-state ${connected ? "ok" : "off"}`}>
                    {connected ? "CONNECTED" : "NOT CONNECTED"}
                  </span>
                </div>
                <div className="ch-info">{meta.info}</div>
                <div className="ch-foot">
                  {conn ? (
                    <>
                      <span className="ok-dot" /> FIRST MESSAGE{" "}
                      {new Date(conn.created_at)
                        .toLocaleDateString([], { month: "short", day: "numeric" })
                        .toUpperCase()}
                    </>
                  ) : envReady ? (
                    <>
                      <span className="ok-dot" /> ENV TOKEN SET · WAITING FOR FIRST DM
                    </>
                  ) : (
                    ENV_HINT[channel]
                  )}
                </div>
              </div>
            );
          })}

          <div className="ch-card">
            <div className="ch-top">
              <div className="ch-dot" style={{ background: "var(--slate)" }}>
                T
              </div>
              <div>
                <div className="ch-name">TikTok</div>
                <div className="ch-handle">—</div>
              </div>
              <span className="ch-state soon">COMING SOON</span>
            </div>
            <div className="ch-info">
              TikTok Shop messages. On the roadmap once the core three are solid.
            </div>
            <div className="ch-foot">NOTIFY ME WHEN LIVE</div>
          </div>

          <div className="ch-card">
            <div className="ch-top">
              <div className="ch-dot" style={{ background: "#7360F2" }}>
                V
              </div>
              <div>
                <div className="ch-name">Viber</div>
                <div className="ch-handle">—</div>
              </div>
              <span className="ch-state soon">COMING SOON</span>
            </div>
            <div className="ch-info">
              Still big with older customers in Nepal. Planned after TikTok.
            </div>
            <div className="ch-foot">NOTIFY ME WHEN LIVE</div>
          </div>

          <div className="ch-card" style={{ borderStyle: "dashed", background: "transparent" }}>
            <div className="ch-top">
              <div
                className="ch-dot"
                style={{
                  background: "var(--bone)",
                  border: "1.5px dashed #c9bfa9",
                  color: "var(--muted)",
                }}
              >
                +
              </div>
              <div>
                <div className="ch-name" style={{ color: "var(--muted)" }}>
                  Request a channel
                </div>
              </div>
            </div>
            <div className="ch-info" style={{ color: "var(--muted)" }}>
              Tell us where your customers message you and we&apos;ll chase it.
            </div>
            <button className="btn ghost" style={{ alignSelf: "flex-start" }}>
              Request
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
