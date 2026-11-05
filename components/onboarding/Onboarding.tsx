"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import BrandMark from "@/components/BrandMark";
import type { Channel, DocChunk, DocumentRow } from "@/lib/types";

/**
 * First-run flow: connect channels → teach Maya → Maya learns → go live.
 * It only reads the existing /api/channels and /api/documents routes and
 * posts to /api/documents/upload, so it is safe to click through on the
 * live demo brand: nothing changes unless a file is actually uploaded.
 */

const STEPS = ["Connect", "Teach", "Learn", "Go live"] as const;

const CHANNELS: { id: Channel; name: string; letter: string; color: string; detail: string }[] = [
  { id: "instagram", name: "Instagram", letter: "I", color: "var(--ig)", detail: "DMs and story replies" },
  { id: "messenger", name: "Messenger", letter: "f", color: "var(--fb)", detail: "Your Facebook Page inbox" },
  { id: "whatsapp", name: "WhatsApp", letter: "W", color: "var(--wa)", detail: "WhatsApp Business number" },
];

interface ChannelsResponse {
  connections?: { channel: Channel }[];
  devMode?: { envReady?: Partial<Record<Channel, boolean>> };
}

type Chunk = Pick<DocChunk, "id" | "document_id" | "content" | "chunk_index">;

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [connected, setConnected] = useState<Record<Channel, boolean> | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    fetch("/api/channels")
      .then((res) => res.json() as Promise<ChannelsResponse>)
      .then((data) => {
        const state = { instagram: false, messenger: false, whatsapp: false };
        for (const c of data.connections ?? []) state[c.channel] = true;
        for (const [ch, ok] of Object.entries(data.devMode?.envReady ?? {})) {
          if (ok) state[ch as Channel] = true;
        }
        setConnected(state);
      })
      .catch(() => setConnected({ instagram: false, messenger: false, whatsapp: false }));
  }, []);

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      setDocuments(data.documents ?? []);
      setChunks(data.chunks ?? []);
    } catch {
      /* keep whatever we had */
    } finally {
      setDocsLoaded(true);
    }
  }, []);

  useEffect(() => {
    const kick = window.setTimeout(loadDocs, 0);
    return () => window.clearTimeout(kick);
  }, [loadDocs]);

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  const go = (to: number) => {
    setDir(to > step ? "fwd" : "back");
    setStep(to);
    window.scrollTo({ top: 0 });
  };

  const connectedCount = connected ? Object.values(connected).filter(Boolean).length : 0;
  const readyDocs = documents.filter((d) => d.status === "ready");
  const passages = readyDocs.reduce((sum, d) => sum + (d.chunk_count ?? 0), 0);

  return (
    <main className="ob">
      <header className="ob-top">
        <div className="ob-brand">
          <BrandMark />
          <span className="brand-name">Myna</span>
        </div>
        {step < 3 && (
          <Link href="/inbox" className="ob-skip">
            Skip setup
          </Link>
        )}
      </header>

      <ol className="ob-progress" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={i < step || step === STEPS.length - 1 ? "done" : i === step ? "current" : undefined}
            aria-current={i === step ? "step" : undefined}
          >
            <span className="ob-bar" aria-hidden="true">
              <span />
            </span>
            <span className="ob-label">{label}</span>
          </li>
        ))}
      </ol>

      <div className="ob-stage">
        <section className="ob-step" data-dir={dir} key={step}>
          {step === 0 && (
            <>
              <StepHead
                ref={heading}
                kicker="Step 1 of 4"
                title="Bring every inbox into one"
                sub="Myna listens on the channels your customers already use. Replies go back out on the same channel."
              />
              <ul className="ob-channels">
                {CHANNELS.map((ch, i) => {
                  const on = connected?.[ch.id];
                  return (
                    <li key={ch.id} className="ob-channel" style={{ animationDelay: `${120 + i * 70}ms` }}>
                      <span className="ch-dot" style={{ background: ch.color }}>
                        {ch.letter}
                      </span>
                      <span className="ob-channel-text">
                        <span className="ob-channel-name">{ch.name}</span>
                        <span className="ob-channel-detail">{ch.detail}</span>
                      </span>
                      {connected === null ? (
                        <span className="ob-pill wait">Checking</span>
                      ) : on ? (
                        <span className="ob-pill ok">
                          <Check /> Connected
                        </span>
                      ) : (
                        <Link href="/channels" className="ob-pill off">
                          Connect
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
              <StepFoot>
                <button className="btn primary ob-next" onClick={() => go(1)} disabled={connected === null}>
                  {connectedCount > 0 ? "Continue" : "Continue without channels"}
                  <Arrow />
                </button>
              </StepFoot>
            </>
          )}

          {step === 1 && (
            <TeachStep
              headingRef={heading}
              documents={documents}
              loaded={docsLoaded}
              onUploaded={loadDocs}
              onBack={() => go(0)}
              onNext={() => go(2)}
            />
          )}

          {step === 2 && (
            <LearnStep
              headingRef={heading}
              documents={documents}
              chunks={chunks}
              passages={passages}
              refresh={loadDocs}
              onBack={() => go(1)}
              onNext={() => go(3)}
            />
          )}

          {step === 3 && (
            <LiveStep headingRef={heading} channels={connectedCount} passages={passages} />
          )}
        </section>
      </div>
    </main>
  );
}

function StepHead({
  ref,
  kicker,
  title,
  sub,
}: {
  ref: React.Ref<HTMLHeadingElement>;
  kicker: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="ob-head">
      <div className="ob-kicker">{kicker}</div>
      <h1 className="ob-title" ref={ref} tabIndex={-1}>
        {title}
      </h1>
      <p className="ob-sub">{sub}</p>
    </div>
  );
}

function StepFoot({ children }: { children: React.ReactNode }) {
  return <div className="ob-foot">{children}</div>;
}

function TeachStep({
  headingRef,
  documents,
  loaded,
  onUploaded,
  onBack,
  onNext,
}: {
  headingRef: React.Ref<HTMLHeadingElement>;
  documents: DocumentRow[];
  loaded: boolean;
  onUploaded: () => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Upload failed. Try again.");
      await onUploaded();
    } catch {
      setError("Upload failed. Check your connection.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <StepHead
        ref={headingRef}
        kicker="Step 2 of 4"
        title="Teach Maya your shop"
        sub="Give her your price list, FAQ or brand guide. She only ever answers from what you give her."
      />

      <div
        className={`ob-drop ${dragging ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) upload(file);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m7 10 5-5 5 5" />
          <path d="M12 5v12" />
        </svg>
        <div className="ob-drop-title">{uploading ? "Uploading…" : "Drop a document here"}</div>
        <div className="ob-drop-fine">PDF, Word, Markdown or plain text</div>
        <button className="btn ghost" disabled={uploading} onClick={() => input.current?.click()}>
          Choose a file
        </button>
        <input
          ref={input}
          type="file"
          accept=".pdf,.docx,.doc,.txt,.md"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <div className="ob-error" role="alert">
          {error}
        </div>
      )}

      {documents.length > 0 && (
        <ul className="ob-docs">
          {documents.slice(0, 4).map((doc, i) => (
            <li key={doc.id} className="ob-doc" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="ob-doc-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
              </span>
              <span className="ob-doc-name">{doc.filename}</span>
              <span className={`ob-doc-state ${doc.status}`}>
                {doc.status === "ready" ? "Ready" : doc.status === "failed" ? "Failed" : "Reading"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <StepFoot>
        <button className="btn ghost" onClick={onBack}>
          Back
        </button>
        <button className="btn primary ob-next" onClick={onNext} disabled={!loaded || documents.length === 0 || uploading}>
          Continue
          <Arrow />
        </button>
      </StepFoot>
    </>
  );
}

function LearnStep({
  headingRef,
  documents,
  chunks,
  passages,
  refresh,
  onBack,
  onNext,
}: {
  headingRef: React.Ref<HTMLHeadingElement>;
  documents: DocumentRow[];
  chunks: Chunk[];
  passages: number;
  refresh: () => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}) {
  const processing = documents.some((d) => d.status === "processing");
  // Reveal what Maya indexed one passage at a time, so the step reads as
  // learning rather than a spinner. Real passages from the index, not filler.
  const shown = chunks.slice(0, 3);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!processing) return;
    const poll = window.setInterval(refresh, 2500);
    return () => window.clearInterval(poll);
  }, [processing, refresh]);

  useEffect(() => {
    if (processing || revealed >= shown.length) return;
    const t = window.setTimeout(() => setRevealed((n) => n + 1), revealed === 0 ? 500 : 650);
    return () => window.clearTimeout(t);
  }, [processing, revealed, shown.length]);

  const done = !processing && revealed >= shown.length;
  const pct = processing ? 35 : shown.length ? Math.round(35 + (65 * revealed) / shown.length) : 100;

  return (
    <>
      <StepHead
        ref={headingRef}
        kicker="Step 3 of 4"
        title={done ? "Maya knows your shop" : "Maya is reading…"}
        sub={
          done
            ? `${passages} passage${passages === 1 ? "" : "s"} indexed. Every reply she sends can point back to the line it came from.`
            : "She splits each document into passages, understands them, and files them so she can find the right one mid-chat."
        }
      />

      <div className="ob-learn" aria-live="polite">
        <div className="ob-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <ul className="ob-passages">
          {shown.slice(0, revealed).map((chunk) => (
            <li key={chunk.id} className="ob-passage">
              <Check />
              <span>{readable(chunk.content)}</span>
            </li>
          ))}
          {!done && (
            <li className="ob-passage pending" aria-hidden="true">
              <span className="ob-shimmer" />
            </li>
          )}
        </ul>
      </div>

      <StepFoot>
        <button className="btn ghost" onClick={onBack}>
          Back
        </button>
        <button className="btn primary ob-next" onClick={onNext} disabled={!done}>
          Turn Maya on
          <Arrow />
        </button>
      </StepFoot>
    </>
  );
}

function LiveStep({
  headingRef,
  channels,
  passages,
}: {
  headingRef: React.Ref<HTMLHeadingElement>;
  channels: number;
  passages: number;
}) {
  return (
    <div className="ob-live">
      <div className="ob-orb" aria-hidden="true">
        <span className="ob-ring" />
        <span className="ob-ring two" />
        <svg viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="24" />
          <path d="M15 27l7 7 15-16" />
        </svg>
      </div>
      <h1 className="ob-title ob-live-title" ref={headingRef} tabIndex={-1}>
        Maya is live
      </h1>
      <p className="ob-sub ob-live-sub">
        She&apos;s answering customers now. Anything sensitive, like a discount or a complaint, waits for
        you in the inbox.
      </p>
      <dl className="ob-stats">
        <div>
          <dt>Channels</dt>
          <dd>{channels}</dd>
        </div>
        <div>
          <dt>Passages learned</dt>
          <dd>{passages}</dd>
        </div>
      </dl>
      <Link href="/inbox" className="btn primary ob-next ob-live-cta">
        Open the inbox
        <Arrow />
      </Link>
    </div>
  );
}

/**
 * Chunks are cut by length, so they start mid-word and carry markdown.
 * Show them as a person would quote them: from the first full sentence,
 * without `#`/`*` markup, cut at a word boundary.
 */
function readable(raw: string, max = 150): string {
  let text = raw.replace(/[#*_`>]+/g, " ").replace(/\s+/g, " ").trim();
  if (!/^[A-Z0-9"“(]/.test(text)) {
    const start = text.search(/[.!?]\s+[A-Z0-9]/);
    if (start !== -1 && start < 80) text = text.slice(start + 1).trim();
  }
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:—-]$/, "")}…`;
}

function Check() {
  return (
    <svg className="ob-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg className="ob-arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
