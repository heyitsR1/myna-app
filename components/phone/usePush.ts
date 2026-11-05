"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Where this device stands on notifications:
 *  - ios-install   iPhone/iPad Safari tab: Web Push only exists once Myna is
 *                  added to the Home Screen and opened from there
 *  - unsupported   a browser with no Web Push at all
 *  - unconfigured  the server has no VAPID key
 *  - off           can ask (or already allowed, just not subscribed)
 *  - denied        the owner said no; only Settings can undo that
 *  - on            subscribed and stored on the server
 */
export type PushState = "loading" | "ios-install" | "unsupported" | "unconfigured" | "off" | "denied" | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS/iPadOS, where push needs a Home Screen install. iPadOS reports itself as a Mac. */
export function isAppleMobile(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

async function saveSubscription(sub: PushSubscription) {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save this device");
}

export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reg = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    let cancelled = false;
    const set = (s: PushState) => !cancelled && setState(s);
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) return set(isAppleMobile() && !isStandalone() ? "ios-install" : "unsupported");
      if (!VAPID_PUBLIC_KEY) return set("unconfigured");
      if (Notification.permission === "denied") return set("denied");
      try {
        reg.current = await registration();
        const sub = await reg.current.pushManager.getSubscription();
        if (!sub) return set("off");
        // Re-sync on every launch: harmless upsert, and it heals a wiped table.
        await saveSubscription(sub).catch(() => {});
        set("on");
      } catch {
        set("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Must run straight from a tap: iOS only shows the prompt for a user gesture. */
  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      reg.current ??= await registration();
      const ready = await navigator.serviceWorker.ready;
      const sub =
        (await ready.pushManager.getSubscription()) ??
        (await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
      await saveSubscription(sub);
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn notifications on");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const sub = await (reg.current ?? (await registration())).pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn notifications off");
    } finally {
      setBusy(false);
    }
  }, []);

  /** Returns a short human result line. */
  const sendTest = useCallback(async (): Promise<string> => {
    const res = await fetch("/api/push/test", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { delivered?: number; subscriptions?: number; error?: string };
    if (!res.ok) return data.error ?? "The test didn't go through";
    const n = data.delivered ?? 0;
    return n === 1 ? "Sent. It should land in a few seconds." : `Sent to ${n} devices.`;
  }, []);

  return { state, busy, error, enable, disable, sendTest };
}
