"use client";

import { useState } from "react";
import AddToHomeIllustration from "@/components/phone/AddToHomeIllustration";
import type { usePush } from "@/components/phone/usePush";

type Push = ReturnType<typeof usePush>;

const BellIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

/**
 * The first thing the owner sees until notifications are on: one card, one
 * action, phrased for the state the phone is actually in.
 */
export function NotificationSetupCard({ push }: { push: Push }) {
  const { state, busy, error, enable } = push;

  if (state === "ios-install") {
    return (
      <section className="ph-card ph-install" aria-labelledby="install-title">
        <AddToHomeIllustration />
        <h2 id="install-title" className="ph-card-title">
          Add Myna to your Home Screen
        </h2>
        <p className="ph-card-sub">iPhone only sends notifications to apps on the Home Screen. It takes ten seconds.</p>
        <ol className="ph-steps">
          <li>
            <span className="ph-step-n">1</span>
            <span>
              Tap <b>Share</b>
              <ShareGlyph /> in Safari (or <b>⋯</b> then <b>Share</b>)
            </span>
          </li>
          <li>
            <span className="ph-step-n">2</span>
            <span>
              Choose <b>Add to Home Screen</b>
            </span>
          </li>
          <li>
            <span className="ph-step-n">3</span>
            <span>
              Open <b>Myna</b> from your Home Screen and turn on notifications
            </span>
          </li>
        </ol>
      </section>
    );
  }

  if (state === "denied") {
    return (
      <section className="ph-card">
        <div className="ph-card-icon muted">
          <BellIcon />
        </div>
        <h2 className="ph-card-title">Notifications are blocked</h2>
        <p className="ph-card-sub">
          Turn them back on in <b>Settings → Notifications → Myna</b>, then come back here.
        </p>
      </section>
    );
  }

  if (state === "unsupported" || state === "unconfigured") {
    return (
      <section className="ph-card">
        <div className="ph-card-icon muted">
          <BellIcon />
        </div>
        <h2 className="ph-card-title">Notifications aren&apos;t available here</h2>
        <p className="ph-card-sub">
          {state === "unconfigured"
            ? "Push keys aren't set up on the server yet."
            : "This browser can't receive push notifications. Open Myna on your phone instead."}
        </p>
      </section>
    );
  }

  return (
    <section className="ph-card" aria-labelledby="notify-title">
      <div className="ph-card-icon">
        <BellIcon />
      </div>
      <h2 id="notify-title" className="ph-card-title">
        Get one ping per new order
      </h2>
      <p className="ph-card-sub">
        Maya answers your DMs. When an order comes in or a customer needs you, Myna tells you here, not ten apps.
      </p>
      <div className="ph-preview" aria-hidden="true">
        <span className="ph-preview-icon" />
        <span className="ph-preview-text">
          <b>New order #57</b>
          <span>Wayfarer Matte Black · Rs 2,800 · Koteshwor</span>
        </span>
        <span className="ph-preview-time">now</span>
      </div>
      <button className="ph-btn primary" onClick={enable} disabled={busy || state === "loading"}>
        {busy ? "Turning on…" : "Turn on notifications"}
      </button>
      {error && <p className="ph-error">{error}</p>}
    </section>
  );
}

/** Once notifications are on: a quiet settings row with Send test and Turn off. */
export function NotificationRow({ push }: { push: Push }) {
  const { busy, error, disable, sendTest } = push;
  const [result, setResult] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const test = async () => {
    setSending(true);
    setResult(null);
    setResult(await sendTest().catch(() => "The test didn't go through"));
    setSending(false);
  };

  return (
    <div className="ph-setting">
      <div className="ph-setting-head">
        <div className="ph-setting-text">
          <div className="ph-setting-title">
            Notifications <span className="ph-on">On</span>
          </div>
          <div className="ph-setting-sub">New orders and customers who need you reach this phone.</div>
        </div>
      </div>
      <div className="ph-setting-actions">
        <button className="ph-btn small" onClick={test} disabled={sending}>
          {sending ? "Sending…" : "Send test"}
        </button>
        <button className="ph-btn small ghost" onClick={disable} disabled={busy}>
          Turn off
        </button>
      </div>
      {(result || error) && (
        <p className="ph-note" role="status">
          {result ?? error}
        </p>
      )}
    </div>
  );
}

function ShareGlyph() {
  return (
    <svg className="ph-share-glyph" viewBox="0 0 24 24" aria-label="Share icon">
      <path d="M12 3v12M8 7l4-4 4 4M7 11H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
    </svg>
  );
}
