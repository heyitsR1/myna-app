"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Registers /sw.js (push notifications only, see public/sw.js) and follows
 * the worker's "open this order" message when a notification is tapped while
 * the app is already open but not controlled by the worker yet.
 */
export default function RegisterServiceWorker() {
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => console.warn("[sw] registration failed", error));

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type !== "myna:navigate" || typeof data.url !== "string") return;
      const url = new URL(data.url, location.origin);
      if (url.origin === location.origin) router.push(url.pathname + url.search);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    // Opening the app clears the home-screen badge the worker set.
    (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => {});
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
