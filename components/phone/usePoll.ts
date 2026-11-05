"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetch JSON now, every `ms`, and the moment the app comes back to the
 * foreground (from a notification or the app switcher).
 */
export function usePoll<T>(url: string | null, ms: number) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  // When `data` was fetched: screens use it as "now" for their "2m ago" labels.
  const [at, setAt] = useState(0);
  const urlRef = useRef(url);
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const reload = useCallback(async () => {
    const current = urlRef.current;
    if (!current) return;
    try {
      const res = await fetch(current, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as T;
      if (urlRef.current === current) {
        setData(json);
        setAt(Date.now());
        setFailed(false);
      }
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!url) return;
    const kick = setTimeout(reload, 0);
    const timer = setInterval(() => document.visibilityState === "visible" && reload(), ms);
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(kick);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, ms, reload]);

  return { data, at, failed, reload };
}

export interface Summary {
  configured: boolean;
  shop: string;
  autopilot: boolean;
  needs: number;
  pendingOrders: number;
  today: { chats: number; replies: number; medianReplySeconds: number | null; orders: number; revenue: number };
  feed: FeedItem[];
}

export interface FeedItem {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  sender_type: "customer" | "ai" | "human";
  status: string;
  created_at: string;
  conversation_id: string;
  conversations: {
    customer_name: string | null;
    external_customer_id: string;
    channel_connections: { channel: "instagram" | "whatsapp" | "messenger" } | null;
  } | null;
}
