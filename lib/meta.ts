/**
 * Meta send paths — one function per channel, plus a dispatcher.
 *
 * Instagram uses graph.instagram.com (Instagram Login apps); Messenger and
 * WhatsApp use graph.facebook.com. The three have different body shapes but
 * the same job: put `text` in front of `recipientId`.
 */
import type { Channel } from "@/lib/types";

const IG_BASE = "https://graph.instagram.com/v23.0";
const FB_BASE = "https://graph.facebook.com/v23.0";

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

async function post(url: string, token: string, body: unknown, label: string): Promise<SendResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "<unreadable>");
    console.error(`[meta] ${label} send failed (${res.status}):`, text);
    return { ok: false, error: text };
  }

  const data = (await res.json().catch(() => ({}))) as {
    message_id?: string;
    messages?: Array<{ id?: string }>;
  };
  return { ok: true, messageId: data.message_id ?? data.messages?.[0]?.id };
}

export function sendInstagramMessage(
  igAccountId: string,
  recipientId: string,
  text: string,
  accessToken: string,
): Promise<SendResult> {
  return post(
    `${IG_BASE}/${igAccountId}/messages`,
    accessToken,
    { recipient: { id: recipientId }, message: { text } },
    `Instagram (account ${igAccountId})`,
  );
}

/** Facebook Page Messenger. `pageId` is the Page's numeric id. */
export function sendMessengerMessage(
  pageId: string,
  recipientId: string,
  text: string,
  pageAccessToken: string,
): Promise<SendResult> {
  return post(
    `${FB_BASE}/${pageId}/messages`,
    pageAccessToken,
    {
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { text },
    },
    `Messenger (page ${pageId})`,
  );
}

/**
 * WhatsApp Cloud API. `phoneNumberId` is the Cloud API phone number ID (not
 * the phone number itself); `recipientId` is the customer's wa_id.
 */
export function sendWhatsAppMessage(
  phoneNumberId: string,
  recipientId: string,
  text: string,
  accessToken: string,
): Promise<SendResult> {
  return post(
    `${FB_BASE}/${phoneNumberId}/messages`,
    accessToken,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientId,
      type: "text",
      text: { preview_url: false, body: text },
    },
    `WhatsApp (number ${phoneNumberId})`,
  );
}

/**
 * Fall back to the dev-mode single-brand env token when a connection row has
 * no stored token of its own (no OAuth connect flow yet).
 */
export function envTokenFor(channel: Channel): string | undefined {
  switch (channel) {
    case "instagram":
      return process.env.IG_ACCESS_TOKEN;
    case "messenger":
      return process.env.FB_PAGE_ACCESS_TOKEN;
    case "whatsapp":
      return process.env.WA_ACCESS_TOKEN;
  }
}

export function envAccountFor(channel: Channel): string | undefined {
  switch (channel) {
    case "instagram":
      return process.env.IG_ACCOUNT_ID;
    case "messenger":
      return process.env.FB_PAGE_ID;
    case "whatsapp":
      return process.env.WA_PHONE_NUMBER_ID;
  }
}

/** Route an outbound message to the right platform. */
export async function sendMessage(
  channel: Channel | string | null,
  accountId: string | null,
  recipientId: string,
  text: string,
  accessToken: string | null,
): Promise<SendResult> {
  if (!channel) return { ok: false, error: "conversation has no channel" };

  const id = accountId ?? envAccountFor(channel as Channel) ?? null;
  const token = accessToken ?? envTokenFor(channel as Channel) ?? null;
  if (!id || !token) {
    return { ok: false, error: `missing ${channel} account id or access token` };
  }

  switch (channel) {
    case "instagram":
      return sendInstagramMessage(id, recipientId, text, token);
    case "messenger":
      return sendMessengerMessage(id, recipientId, text, token);
    case "whatsapp":
      return sendWhatsAppMessage(id, recipientId, text, token);
    default:
      return { ok: false, error: `unknown channel ${channel}` };
  }
}

/**
 * Best-effort display name for a customer, so the inbox shows a person and
 * not a 17-digit id. Never throws — a missing name is not worth a failed
 * ingest, and the scoped-id lookup is not guaranteed on every app.
 */
export async function fetchCustomerName(
  channel: Channel,
  customerId: string,
  accessToken: string,
): Promise<string | null> {
  const url =
    channel === "instagram"
      ? `${IG_BASE}/${customerId}?fields=name,username`
      : channel === "messenger"
        ? `${FB_BASE}/${customerId}?fields=name`
        : null;
  if (!url) return null;

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { name?: string; username?: string };
    return data.name ?? (data.username ? `@${data.username}` : null);
  } catch {
    return null;
  }
}

/**
 * The Instagram token the app will actually use: a refreshed one stored on
 * the connection row wins over the dev-mode env token (see
 * `app/api/maintenance/refresh-ig-token`). `source` says which, for /health.
 */
export async function instagramToken(): Promise<{
  token: string | null;
  source: "database" | "env" | "none";
  expiresAt: string | null;
}> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from("channel_connections")
      .select("access_token, token_expires_at")
      .eq("channel", "instagram")
      .not("access_token", "is", null)
      .order("token_expires_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (data?.access_token) {
      return { token: data.access_token, source: "database", expiresAt: data.token_expires_at ?? null };
    }
  }
  const env = process.env.IG_ACCESS_TOKEN ?? null;
  return { token: env, source: env ? "env" : "none", expiresAt: null };
}

/** Exchange a valid long-lived Instagram token for a fresh 60-day one. */
export async function refreshInstagramToken(
  current: string,
): Promise<{ ok: true; token: string; expiresAt: string } | { ok: false; error: string }> {
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(current)}`;
  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !data.access_token) {
    return { ok: false, error: data.error?.message ?? `refresh failed (${res.status})` };
  }
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 60 * 86400) * 1000).toISOString();
  return { ok: true, token: data.access_token, expiresAt };
}

/** How an attachment-only DM reads in the inbox and in Maya's history. */
export const ATTACHMENT_LABEL: Record<string, string> = {
  video: "Shared a video",
  image: "Shared a photo",
  audio: "Sent a voice message",
  file: "Shared a file",
  share: "Shared a post",
  ig_reel: "Shared a reel",
  reel: "Shared a reel",
  story_mention: "Mentioned you in a story",
};

/**
 * Send one image by public URL. WhatsApp shows `caption` under the photo;
 * Instagram and Messenger have no captions, so the caption goes as a
 * follow-up text only when the caller sends one.
 */
export async function sendImage(
  channel: Channel | string | null,
  accountId: string | null,
  recipientId: string,
  imageUrl: string,
  caption: string,
  accessToken: string | null,
): Promise<SendResult> {
  if (!channel) return { ok: false, error: "conversation has no channel" };
  const id = accountId ?? envAccountFor(channel as Channel) ?? null;
  const token = accessToken ?? envTokenFor(channel as Channel) ?? null;
  if (!id || !token) return { ok: false, error: `missing ${channel} account id or access token` };

  if (channel === "whatsapp") {
    return post(
      `${FB_BASE}/${id}/messages`,
      token,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientId,
        type: "image",
        image: { link: imageUrl, caption },
      },
      `WhatsApp image (number ${id})`,
    );
  }
  const message = { attachment: { type: "image", payload: { url: imageUrl } } };
  return channel === "instagram"
    ? post(`${IG_BASE}/${id}/messages`, token, { recipient: { id: recipientId }, message }, `Instagram image (account ${id})`)
    : post(
        `${FB_BASE}/${id}/messages`,
        token,
        { recipient: { id: recipientId }, messaging_type: "RESPONSE", message },
        `Messenger image (page ${id})`,
      );
}
