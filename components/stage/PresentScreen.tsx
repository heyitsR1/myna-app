"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { DECK_ORIGINS } from "./present-config";

/**
 * The projector console for the live demo. One tab on the presenter's
 * laptop, five views switched with the tabs or the number keys:
 *
 *  1 Slides:  the summit deck (cross-origin, on Vercel)
 *  2 Landing: /try, the page behind the "Scan me" QR
 *  3 Live:    /wall, the room's DMs landing and Maya answering
 *  4 Inbox:   /inbox, the owner's desktop app
 *  5 Phone:   /m, the owner's phone app, framed like a phone so it reads on
 *             a 16:9 projector
 *
 * Every view stays mounted, so switching is instant and each keeps its
 * scroll and open chat. Other keys:
 *
 *  H      hide the tabs and timer buttons
 *  T      start / pause the audience timer (shown from the first press)
 *  + / =  timer +10 s     ]  timer +20 s     R  reset and hide the timer
 *  B      swap in the backup recording (and back); Shift+B restarts it
 *
 * Keys typed into an input inside a frame are ignored, so the inbox's
 * composer never switches tabs. The deck can't share its keydowns (cross
 * origin), so it posts them up as `{type: "present-key", key, shiftKey}`.
 */

const MODES = [
  { id: "slides", label: "Slides", key: "1" },
  { id: "landing", label: "Landing", key: "2" },
  { id: "live", label: "Live", key: "3" },
  { id: "inbox", label: "Inbox", key: "4" },
  { id: "phone", label: "Phone", key: "5" },
] as const;

type Mode = (typeof MODES)[number]["id"];

const BACKUP_SRC = "/present/backup.mp4";
const TIMER_DEFAULT = 45_000;
const URGENT_UNDER = 10_000;
// "Time's up" stays big this long, then shrinks out of the way.
const DONE_LOUD_FOR = 5_000;

type Timer = {
  shown: boolean;
  /** Length of the current countdown, for the progress bar. */
  total: number;
  /** Time left while paused. */
  left: number;
  /** When it hits zero, while running. */
  deadline: number | null;
};

const TIMER_IDLE: Timer = { shown: false, total: TIMER_DEFAULT, left: TIMER_DEFAULT, deadline: null };

function remainingAt(t: Timer, now: number) {
  return t.deadline === null ? t.left : Math.max(0, t.deadline - now);
}

function clock(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Typing into a field (in this window or a frame) must not trigger keys. */
function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export default function PresentScreen({ deckUrl }: { deckUrl: string }) {
  const [mode, setMode] = useState<Mode>("slides");
  const [tabs, setTabs] = useState(true);
  const [timer, setTimer] = useState<Timer>(TIMER_IDLE);
  const [now, setNow] = useState(0);
  const [backupReady, setBackupReady] = useState(false);
  const [backup, setBackup] = useState(false);

  const deckRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // ---- Timer -------------------------------------------------------------

  const toggleTimer = () => {
    const at = Date.now();
    setNow(at);
    setTimer((t) => {
      if (!t.shown) return { ...t, shown: true, deadline: at + t.left };
      if (t.deadline !== null) return { ...t, left: remainingAt(t, at), deadline: null };
      // Paused at zero: T runs a fresh default countdown.
      if (t.left <= 0) return { shown: true, total: TIMER_DEFAULT, left: TIMER_DEFAULT, deadline: at + TIMER_DEFAULT };
      return { ...t, deadline: at + t.left };
    });
  };

  const addTime = (ms: number) => {
    const at = Date.now();
    setNow(at);
    setTimer((t) => {
      const rem = remainingAt(t, at);
      const total = rem <= 0 ? ms : t.total + ms;
      if (t.deadline === null) return { ...t, total, left: rem + ms };
      return { ...t, total, deadline: at + rem + ms };
    });
  };

  // Tick while running, and a little past zero so "Time's up" can quieten.
  useEffect(() => {
    const { deadline } = timer;
    if (deadline === null) return;
    const id = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at - deadline > DONE_LOUD_FOR + 1000) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [timer]);

  const remaining = remainingAt(timer, now);
  const running = timer.deadline !== null;
  const done = timer.shown && remaining <= 0;
  const quiet = done && (!running || now - (timer.deadline ?? 0) > DONE_LOUD_FOR);
  const urgent = running && !done && remaining <= URGENT_UNDER;
  const timerState = done ? (quiet ? "done-quiet" : "done") : urgent ? "urgent" : running ? "running" : "paused";

  // ---- Backup recording --------------------------------------------------

  // B does nothing unless the recording really exists. The gate redirects a
  // logged-out request to /login (HTML, 200), so check the type too.
  useEffect(() => {
    let live = true;
    fetch(BACKUP_SRC, { method: "HEAD", cache: "no-store" })
      .then((r) => {
        if (live && r.ok && (r.headers.get("content-type") ?? "").startsWith("video/")) setBackupReady(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (backup) v.play().catch(() => {});
    else v.pause();
  }, [backup]);

  const restartBackup = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    if (backup) v.play().catch(() => {});
  };

  // ---- Keys --------------------------------------------------------------

  const pick = (m: Mode) => {
    setMode(m);
    setBackup(false);
  };

  const onPresentKey = useEffectEvent((key: string, shift: boolean) => {
    const hit = MODES.find((m) => m.key === key);
    if (hit) return pick(hit.id);
    switch (key) {
      case "h":
      case "H":
        return setTabs((t) => !t);
      case "t":
      case "T":
        return toggleTimer();
      case "+":
      case "=":
        return addTime(10_000);
      case "]":
        return addTime(20_000);
      case "r":
      case "R":
        return setTimer(TIMER_IDLE);
      case "b":
      case "B":
        if (!backupReady) return;
        return shift ? restartBackup() : setBackup((b) => !b);
    }
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTyping(e.target)) return;
      onPresentKey(e.key, e.shiftKey);
    };
    // Keys pressed while a same-origin frame has focus never reach this
    // window, so listen inside those frames too.
    const frames = [...document.querySelectorAll<HTMLIFrameElement>("iframe[data-same-origin]")];
    const attach = (f: HTMLIFrameElement) => {
      try {
        f.contentWindow?.removeEventListener("keydown", onKey);
        f.contentWindow?.addEventListener("keydown", onKey);
      } catch {
        // Cross-origin (e.g. bounced to another host): nothing to attach to.
      }
    };
    const onLoads = frames.map((f) => {
      const onLoad = () => attach(f);
      f.addEventListener("load", onLoad);
      attach(f);
      return () => {
        f.removeEventListener("load", onLoad);
        try {
          f.contentWindow?.removeEventListener("keydown", onKey);
        } catch {}
      };
    });

    // The deck forwards its keys by postMessage.
    const onMessage = (e: MessageEvent) => {
      if (!DECK_ORIGINS.includes(e.origin)) return;
      const data = e.data as { type?: unknown; key?: unknown; shiftKey?: unknown } | null;
      if (data?.type !== "present-key" || typeof data.key !== "string") return;
      const shift = typeof data.shiftKey === "boolean" ? data.shiftKey : data.key === "B";
      onPresentKey(data.key, shift);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMessage);
      onLoads.forEach((off) => off());
    };
  }, []);

  // Slides takes focus so the arrow keys drive the deck; every other view
  // takes it back, so keys land here and arrows never reach the hidden deck.
  useEffect(() => {
    if (mode === "slides" && !backup) {
      deckRef.current?.focus();
      deckRef.current?.contentWindow?.focus();
    } else {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) active.blur();
      window.focus();
    }
  }, [mode, backup]);

  const onDeckLoad = () => {
    if (mode === "slides" && !backup) deckRef.current?.focus();
  };

  // Fit the 868px-tall phone to the projector's height.
  useEffect(() => {
    const fit = () => {
      const scale = Math.min(1.15, (window.innerHeight - 90) / 868);
      document.documentElement.style.setProperty("--phone-scale", String(scale));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const view = (m: Mode) => ({ "data-on": mode === m, inert: mode !== m, "aria-hidden": mode !== m });

  return (
    <main className="present" data-mode={mode}>
      <iframe
        ref={deckRef}
        className="present-frame present-full"
        src={deckUrl}
        title="Slides"
        allow="fullscreen; autoplay"
        onLoad={onDeckLoad}
        {...view("slides")}
      />
      <iframe data-same-origin className="present-frame present-full" src="/try" title="Landing" {...view("landing")} />
      <iframe data-same-origin className="present-frame present-full" src="/wall" title="Live wall" {...view("live")} />
      <iframe
        data-same-origin
        className="present-frame present-full"
        src="/inbox?desktop=1"
        title="Inbox"
        {...view("inbox")}
      />
      <div className="present-phone-stage" {...view("phone")}>
        <div className="present-phone">
          <iframe data-same-origin className="present-frame present-phone-screen" src="/m" title="Owner phone app" />
        </div>
      </div>

      {backupReady && (
        <video
          ref={videoRef}
          className="present-backup"
          src={BACKUP_SRC}
          preload="auto"
          muted
          playsInline
          data-on={backup}
          aria-hidden
        />
      )}

      {timer.shown && (
        <div className="present-timer" data-state={timerState} role="timer" aria-live="off">
          <span className="present-timer-time">{done ? "Time’s up" : clock(remaining)}</span>
          <span className="present-timer-bar" aria-hidden>
            <span style={{ transform: `scaleX(${timer.total > 0 ? remaining / timer.total : 0})` }} />
          </span>
        </div>
      )}

      <nav className="present-tabs" hidden={!tabs} aria-label="Demo view">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className="present-tab"
            aria-pressed={mode === m.id && !backup}
            onClick={() => pick(m.id)}
          >
            {m.label}
          </button>
        ))}
        <span className="present-tabs-sep" aria-hidden />
        <button
          type="button"
          className="present-tab present-tab-timer"
          aria-label={running ? "Pause timer" : "Start timer"}
          onClick={toggleTimer}
        >
          {running ? "❚❚" : "▶"}
        </button>
        <button type="button" className="present-tab present-tab-timer" onClick={() => addTime(10_000)}>
          +10
        </button>
        <button type="button" className="present-tab present-tab-timer" onClick={() => addTime(20_000)}>
          +20
        </button>
      </nav>
    </main>
  );
}
