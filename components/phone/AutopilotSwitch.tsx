"use client";

import { useEffect, useState } from "react";

/** The Autopilot setting: Maya confirms orders herself when it's on. */
export default function AutopilotSwitch() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/autopilot")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setEnabled(d.enabled === true))
      .catch(() => setEnabled(false));
  }, []);

  const toggle = async () => {
    if (enabled === null) return;
    const next = !enabled;
    setEnabled(next); // optimistic; reverted below if the save fails
    setError(null);
    try {
      const res = await fetch("/api/settings/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { enabled?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't save");
      setEnabled(data.enabled === true);
    } catch (e) {
      setEnabled(!next);
      setError(e instanceof Error ? e.message : "Couldn't save");
    }
  };

  return (
    <div className="ph-setting">
      <label className="ph-setting-head" htmlFor="autopilot">
        <span className="ph-setting-text">
          <span className="ph-setting-title">Autopilot</span>
          <span className="ph-setting-sub">
            {enabled
              ? "Maya confirms orders herself. You just get a “confirmed” notification."
              : "Maya books orders and you confirm each one. Turn on to let her confirm them too."}
          </span>
        </span>
        <button
          id="autopilot"
          role="switch"
          aria-checked={enabled === true}
          className={`ph-switch ${enabled ? "on" : ""}`}
          onClick={toggle}
          disabled={enabled === null}
        >
          <span className="ph-switch-knob" />
        </button>
      </label>
      {error && <p className="ph-error">{error}</p>}
    </div>
  );
}
