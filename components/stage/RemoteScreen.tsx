"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { RemoteState } from "@/lib/remote";

const VIEWS = [
  { key: "1", mode: "slides", label: "Slides" },
  { key: "2", mode: "landing", label: "Landing" },
  { key: "3", mode: "live", label: "Wall" },
  { key: "4", mode: "inbox", label: "Inbox" },
  { key: "5", mode: "phone", label: "Phone" },
];

/** Laptop counts as gone after this long without a heartbeat (it sends every 2 s). */
const STALE_AFTER = 5_000;
const HOLD_FOR = 700;

type Channel = ReturnType<NonNullable<ReturnType<typeof getSupabase>>["channel"]>;

function clock(ms: number) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function buzz() {
  navigator.vibrate?.(8);
}

export default function RemoteScreen({ channel }: { channel: string }) {
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState<RemoteState | null>(null);
  const [heardAt, setHeardAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [holding, setHolding] = useState(false);
  const chRef = useRef<Channel | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const ch = supabase
      .channel(channel)
      .on("broadcast", { event: "state" }, ({ payload }) => {
        setState(payload as RemoteState);
        setHeardAt(Date.now());
      })
      .subscribe((status) => {
        const ok = status === "SUBSCRIBED";
        setJoined(ok);
        if (ok) ch.send({ type: "broadcast", event: "hello", payload: {} });
      });
    chRef.current = ch;
    return () => {
      chRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [channel]);

  // Local clock for the timer readout and the connection light.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Keep the phone awake at the podium.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const take = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      document.removeEventListener("visibilitychange", take);
      lock?.release().catch(() => {});
    };
  }, []);

  const send = (key: string, shift = false) => {
    buzz();
    chRef.current?.send({ type: "broadcast", event: "cmd", payload: { key, shift } });
  };

  const live = joined && state !== null && now - heardAt < STALE_AFTER;
  const onSlides = state?.mode === "slides" && !state.backup;
  const timer = state?.timer;
  const timerLeft = timer ? (timer.running ? timer.remaining - (now - heardAt) : timer.remaining) : 0;
  const deck = state?.deck;
  const where = !state
    ? "Waiting for the laptop…"
    : state.backup
      ? "Backup video playing"
      : state.mode === "slides"
        ? deck
          ? `Slide ${deck.index + 1} of ${deck.total}`
          : "Slides"
        : VIEWS.find((v) => v.mode === state.mode)?.label ?? state.mode;

  // Backup video: hold to swap in (so a pocket tap can't do it), tap to leave.
  const holdStart = () => {
    if (state?.backup) return send("b");
    setHolding(true);
    holdRef.current = setTimeout(() => {
      setHolding(false);
      send("b");
    }, HOLD_FOR);
  };
  const holdEnd = () => {
    if (holdRef.current) clearTimeout(holdRef.current);
    holdRef.current = null;
    setHolding(false);
  };

  return (
    <main className="rm" data-live={live}>
      <header className="rm-head">
        <span className="rm-light" aria-hidden />
        <div className="rm-where">
          <strong>{where}</strong>
          <span>{live ? (deck && onSlides ? `${deck.slide}${deck.step ? ` · click ${deck.step}` : ""}` : "Laptop connected") : joined ? "Laptop not responding" : "Connecting…"}</span>
        </div>
        {timer?.shown && (
          <span className="rm-clock num" data-running={timer.running}>
            {timerLeft <= 0 ? "0:00" : clock(timerLeft)}
          </span>
        )}
      </header>

      <section className="rm-nav">
        <button type="button" className="rm-btn rm-back" disabled={!onSlides} onClick={() => send("ArrowLeft")}>
          Back
        </button>
        <button type="button" className="rm-btn rm-next" disabled={!onSlides} onClick={() => send("ArrowRight")}>
          Next
        </button>
      </section>

      <section className="rm-views" aria-label="Screen">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            className="rm-btn rm-view"
            aria-pressed={state?.mode === v.mode && !state.backup}
            onClick={() => send(v.key)}
          >
            {v.label}
          </button>
        ))}
      </section>

      <section className="rm-row" aria-label="Timer">
        <button type="button" className="rm-btn rm-wide" onClick={() => send("t")}>
          {timer?.running ? "Pause clock" : timer?.shown ? "Resume clock" : "Start clock"}
        </button>
        <button type="button" className="rm-btn" onClick={() => send("+")}>
          +10
        </button>
        <button type="button" className="rm-btn" onClick={() => send("]")}>
          +20
        </button>
        <button type="button" className="rm-btn" disabled={!timer?.shown} onClick={() => send("r")}>
          Hide
        </button>
      </section>

      <section className="rm-row rm-foot">
        <button type="button" className="rm-btn" onClick={() => send("h")}>
          {state?.tabs === false ? "Show tabs" : "Hide tabs"}
        </button>
        <button
          type="button"
          className="rm-btn rm-backup"
          data-holding={holding}
          aria-pressed={state?.backup ?? false}
          disabled={state ? !state.backupReady : false}
          onPointerDown={holdStart}
          onPointerUp={holdEnd}
          onPointerLeave={holdEnd}
          onPointerCancel={holdEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span>{state?.backup ? "Back to live" : "Hold for backup video"}</span>
        </button>
      </section>
    </main>
  );
}
