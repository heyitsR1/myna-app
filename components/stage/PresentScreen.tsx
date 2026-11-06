"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The projector view for the live demo. One screen, three real views of the
 * same shop, switched with the tabs or the 1/2/3 keys:
 *
 *  - Live:  /wall, the room's DMs landing and Maya answering
 *  - Inbox: /inbox, the owner's desktop app
 *  - Phone: /m, the owner's phone app, framed like a phone so it reads on
 *           a 16:9 projector
 *
 * All three stay mounted (iframes on the same origin, same session), so
 * switching is instant and each keeps its scroll and open chat. H hides the
 * tabs.
 */

const MODES = [
  { id: "live", label: "Live", key: "1" },
  { id: "inbox", label: "Inbox", key: "2" },
  { id: "phone", label: "Phone", key: "3" },
] as const;

type Mode = (typeof MODES)[number]["id"];

export default function PresentScreen() {
  const [mode, setMode] = useState<Mode>("live");
  const [tabs, setTabs] = useState(true);

  const pick = useCallback((m: Mode) => setMode(m), []);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const hit = MODES.find((m) => m.key === e.key);
      if (hit) pick(hit.id);
      if (e.key === "h" || e.key === "H") setTabs((t) => !t);
    };
    // Keys pressed while an iframe has focus never reach this window, so
    // listen inside the frames too (same origin).
    const frames = [...document.querySelectorAll<HTMLIFrameElement>(".present-frame")];
    const attach = () =>
      frames.forEach((f) => f.contentWindow?.addEventListener("keydown", onKey));
    window.addEventListener("keydown", onKey);
    frames.forEach((f) => f.addEventListener("load", attach));
    attach();
    return () => {
      window.removeEventListener("keydown", onKey);
      frames.forEach((f) => {
        f.removeEventListener("load", attach);
        f.contentWindow?.removeEventListener("keydown", onKey);
      });
    };
  }, [pick]);

  return (
    <main className="present" data-mode={mode}>
      <nav className="present-tabs" hidden={!tabs} aria-label="Demo view">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className="present-tab"
            aria-pressed={mode === m.id}
            onClick={() => pick(m.id)}
          >
            {m.label}
          </button>
        ))}
      </nav>

      <iframe className="present-frame present-live" src="/wall" title="Live wall" hidden={mode !== "live"} />
      <iframe className="present-frame present-inbox" src="/inbox?desktop=1" title="Inbox" hidden={mode !== "inbox"} />

      <div className="present-phone-stage" hidden={mode !== "phone"}>
        <div className="present-phone">
          <iframe className="present-frame present-phone-screen" src="/m" title="Owner phone app" />
        </div>
      </div>
    </main>
  );
}
