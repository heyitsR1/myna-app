"use client";

import { useRef, useState } from "react";
import BrandMark from "@/components/BrandMark";

export default function LoginForm({ next }: { next: string }) {
  const [user, setUser] = useState("myna");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  // A short horizontal nudge on a wrong password, skipped for reduced motion.
  const nudge = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    card.current?.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }],
      { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password, next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        // A full navigation, so the proxy sees the fresh cookie on every request.
        window.location.assign(data.next ?? next);
        return;
      }
      setError(data.error ?? "Couldn't sign in. Try again.");
      nudge();
    } catch {
      setError("Couldn't reach Myna. Check your connection.");
    }
    setBusy(false);
  };

  return (
    <main className="gate">
      <div className="gate-card" ref={card}>
        <img className="gate-art" src="/brand/myna-shop.webp" alt="" width={520} height={620} />
        <div className="gate-brand">
          <BrandMark size={36} />
          <span className="gate-name">Myna</span>
        </div>
        <h1 className="gate-title">Welcome back</h1>
        <p className="gate-sub">
          Every DM from Instagram, Messenger and WhatsApp, in one inbox, with Maya
          answering beside you.
        </p>

        <form className="gate-form" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Username</span>
            <input
              className="field-input"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="field-input"
              type="password"
              name="password"
              autoComplete="current-password"
              enterKeyHint="go"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "gate-error" : undefined}
              required
            />
          </label>

          <div className="gate-error" id="gate-error" role="alert">
            {error}
          </div>

          <button className="btn primary gate-submit" disabled={busy || !password}>
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
      <footer className="gate-foot">
        <a href="/privacy">Privacy</a>
        <span aria-hidden="true">·</span>
        <a href="/data-deletion">Data deletion</a>
      </footer>
    </main>
  );
}
