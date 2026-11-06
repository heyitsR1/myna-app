import { after, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOrCreateDefaultBrand } from "@/lib/brand";
import { generateAndSendReply } from "@/lib/reply";
import { ATTACHMENT_LABEL, envAccountFor, envTokenFor, fetchCustomerName, sendTypingIndicator } from "@/lib/meta";
import type { Channel } from "@/lib/types";

export const runtime = "nodejs";

// ── GET: Meta verification handshake ────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.META_VERIFY_TOKEN;
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return new Response(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

// ── POST: incoming events ───────────────────────────────────────────────────
/**
 * A single Meta app can sign webhooks with more than one secret. An
 * "Instagram API with Instagram Login" app carries its own Instagram App
 * Secret (Instagram settings) alongside the app-level one (App settings →
 * Basic): Instagram events are signed with the former, `page` and
 * `whatsapp_business_account` events with the latter. Both are valid, so we
 * accept either rather than forcing one product to lose.
 */
function appSecrets(): string[] {
  return [process.env.META_APP_SECRET, process.env.META_APP_SECRET_ALT].filter(
    (secret): secret is string => Boolean(secret),
  );
}

function matchesSecret(rawBody: string, received: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody, "utf-8").digest("hex");
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

function verifySignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const received = header.slice("sha256=".length);
  // Every candidate is checked — no early exit — so a failure costs the same
  // time regardless of which secret was wrong.
  return appSecrets().reduce(
    (ok, secret) => matchesSecret(rawBody, received, secret) || ok,
    false,
  );
}

/**
 * The three Meta channels arrive in two different envelope shapes. Everything
 * downstream works off this one normalised record instead.
 */
interface InboundMessage {
  channel: Channel;
  /** The business account the message was sent TO — the connection key. */
  accountId: string;
  /** The customer who sent it. */
  senderId: string;
  senderName: string | null;
  externalMessageId: string;
  text: string;
  /** When the platform says it was sent, ISO. Null when absent. */
  sentAt: string | null;
  /** A photo / video / post / voice note with no words. Answered only if no words follow within a few seconds. */
  attachmentOnly?: boolean;
  /** A photo Maya can look at: Instagram/Messenger CDN url, or a WhatsApp media id. */
  media?: { kind: "image"; url?: string; wa_media_id?: string; mime?: string } | null;
}

// Instagram + Messenger share the `messaging[]` envelope.
interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  /** Milliseconds since epoch. */
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  };
}

// WhatsApp Cloud API uses `changes[].value`.
interface WhatsAppValue {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: Array<{
    from?: string;
    id?: string;
    type?: string;
    /** Seconds since epoch, as a string. */
    timestamp?: string;
    text?: { body?: string };
    image?: { id?: string; mime_type?: string; caption?: string };
  }>;
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    messaging?: MessagingEvent[];
    changes?: Array<{ field?: string; value?: WhatsAppValue }>;
  }>;
}

/**
 * Meta hands out two timestamp formats: Instagram/Messenger send
 * milliseconds as a number, WhatsApp sends seconds as a string. Both mean
 * "when the customer hit send" — which is not when we received it. Meta
 * retries a rejected delivery for hours, so ingest time can be wildly later
 * than send time, and ordering by it puts the conversation out of sequence.
 */
function toIso(raw: number | string | undefined): string | null {
  if (raw === undefined) return null;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(n) || n <= 0) return null;
  // < 1e12 means seconds, not milliseconds.
  const ms = n < 1e12 ? n * 1000 : n;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseMessagingEvent(channel: Channel, event: MessagingEvent): InboundMessage | null {
  if (event.message?.is_echo) return null; // our own outbound, echoed back
  const senderId = event.sender?.id;
  const accountId = event.recipient?.id;
  const externalMessageId = event.message?.mid;
  const attachment = event.message?.attachments?.[0];
  const attachmentType = attachment?.type;
  const text =
    event.message?.text ??
    // Unknown types are dropped: Instagram also sends a "fallback" attachment
    // when it turns a phone number in a text into a contact card.
    (attachmentType ? ATTACHMENT_LABEL[attachmentType] : undefined);
  if (!senderId || !accountId || !externalMessageId || !text) return null;
  return {
    channel,
    accountId,
    senderId,
    senderName: null,
    externalMessageId,
    text,
    sentAt: toIso(event.timestamp),
    attachmentOnly: !event.message?.text,
    media: attachmentType === "image" && attachment?.payload?.url ? { kind: "image", url: attachment.payload.url } : null,
  };
}

function parseWhatsAppValue(value: WhatsAppValue): InboundMessage[] {
  const accountId = value.metadata?.phone_number_id;
  if (!accountId) return [];

  const nameFor = (waId: string) =>
    value.contacts?.find((c) => c.wa_id === waId)?.profile?.name ?? null;

  const out: InboundMessage[] = [];
  for (const msg of value.messages ?? []) {
    // Delivery/read receipts arrive under `statuses`, not `messages`, so
    // anything here is a real inbound. Text and photos are handled; other
    // types are skipped for now.
    if (msg.type && msg.type !== "text" && msg.type !== "image") continue;
    const senderId = msg.from;
    const externalMessageId = msg.id;
    const isImage = msg.type === "image" && Boolean(msg.image?.id);
    const caption = msg.image?.caption?.trim();
    const text = isImage ? caption || ATTACHMENT_LABEL.image : msg.text?.body;
    if (!senderId || !externalMessageId || !text) continue;
    out.push({
      channel: "whatsapp",
      accountId,
      senderId,
      senderName: nameFor(senderId),
      externalMessageId,
      text,
      sentAt: toIso(msg.timestamp),
      attachmentOnly: isImage && !caption,
      media: isImage ? { kind: "image", wa_media_id: msg.image!.id, mime: msg.image!.mime_type } : null,
    });
  }
  return out;
}

/** Turn one webhook payload into normalised messages, whatever the channel. */
function parsePayload(payload: MetaWebhookPayload): InboundMessage[] {
  const out: InboundMessage[] = [];

  switch (payload.object) {
    case "instagram":
    case "page": {
      const channel: Channel = payload.object === "instagram" ? "instagram" : "messenger";
      for (const entry of payload.entry ?? []) {
        for (const event of entry.messaging ?? []) {
          const parsed = parseMessagingEvent(channel, event);
          if (parsed) out.push(parsed);
        }
      }
      break;
    }
    case "whatsapp_business_account": {
      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          if (change.field !== "messages" || !change.value) continue;
          out.push(...parseWhatsAppValue(change.value));
        }
      }
      break;
    }
    default:
      console.log("[webhook] ignoring object type:", payload.object);
  }

  return out;
}

async function ingest(inbound: InboundMessage): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn("[webhook] Supabase not configured; message logged only:", inbound.externalMessageId);
    return;
  }

  // Find (or, in dev mode, create) the channel connection for the account
  // this message was sent to.
  let { data: connection } = await supabase
    .from("channel_connections")
    .select("*")
    .eq("channel", inbound.channel)
    .eq("external_account_id", inbound.accountId)
    .maybeSingle();

  if (!connection) {
    const brand = await getOrCreateDefaultBrand();
    if (!brand) return;
    const { data: created, error } = await supabase
      .from("channel_connections")
      .insert({
        brand_id: brand.id,
        channel: inbound.channel,
        external_account_id: inbound.accountId,
        access_token: envTokenFor(inbound.channel) ?? null,
      })
      .select()
      .single();
    if (error) {
      console.error("[webhook] failed to create channel connection:", error.message);
      return;
    }
    connection = created;
  }

  const sentAt = inbound.sentAt ?? new Date().toISOString();

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .upsert(
      {
        brand_id: connection.brand_id,
        channel_connection_id: connection.id,
        external_customer_id: inbound.senderId,
        last_message_at: sentAt,
        status: "open",
      },
      { onConflict: "channel_connection_id,external_customer_id" },
    )
    .select()
    .single();
  if (convError || !conversation) {
    console.error("[webhook] conversation upsert failed:", convError?.message);
    return;
  }

  const { data: message, error: msgError } = await supabase
    .from("messages")
    .upsert(
      {
        conversation_id: conversation.id,
        direction: "inbound",
        sender_type: "customer",
        body: inbound.text,
        external_message_id: inbound.externalMessageId,
        created_at: sentAt,
        media: inbound.media ?? null,
      },
      { onConflict: "external_message_id", ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();
  if (msgError) {
    console.error("[webhook] message insert failed:", msgError.message);
    return;
  }
  if (!message) return; // duplicate delivery — already processed

  // The reply deadline counts from here, not from when after() gets going.
  const receivedAt = Date.now();
  after(async () => {
    // "Seen" and the typing dots straight away, so the wait reads as Maya
    // working, not as silence. Skipped when the owner has switched Maya off
    // in this chat: they answer, and dots with no reply would be a lie.
    const token = connection.access_token ?? envTokenFor(inbound.channel);
    const account = connection.external_account_id ?? envAccountFor(inbound.channel);
    const typing =
      token && account && conversation.ai_enabled !== false
        ? sendTypingIndicator(inbound.channel, account, inbound.senderId, token, inbound.externalMessageId)
        : Promise.resolve();

    // Keep the customer's name current, so the inbox shows a person not an id.
    // WhatsApp ships the profile name on every message and people rename
    // themselves, so trust a fresh name over a stored one rather than naming
    // once and never again. Runs alongside the reply rather than before it.
    const naming = (async () => {
      const name =
        inbound.senderName ??
        (conversation.customer_name
          ? null
          : token
            ? await fetchCustomerName(inbound.channel, inbound.senderId, token)
            : null);
      if (name && name !== conversation.customer_name) {
        await supabase
          .from("conversations")
          .update({ customer_name: name })
          .eq("id", conversation.id);
      }
    })().catch((err) => console.error("[webhook] customer name update failed:", err));

    // A shared post, reel, photo or voice note on its own usually comes
    // just before the words ("kati parcha?"). Give the customer a few seconds
    // to add them, and answer the attachment only if they don't: the text's
    // own pipeline sees it in its history. Until 6 Nov anything but a photo
    // was never answered at all, so a lone reel or voice note got silence.
    if (inbound.attachmentOnly) {
      await new Promise((r) => setTimeout(r, 6000));
      const { data: newer } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation.id)
        .eq("direction", "inbound")
        .gt("created_at", message.created_at)
        .limit(1);
      if (newer && newer.length > 0) {
        await Promise.all([typing, naming]);
        return;
      }
    }

    try {
      await generateAndSendReply(conversation.id, message.id, { receivedAt });
    } catch (err) {
      console.error("[webhook] reply pipeline failed:", err);
    }
    await Promise.all([typing, naming]);
  });
}

/**
 * Say *which* product's event failed the signature check. Meta apps can carry
 * more than one secret (the Instagram product has its own App Secret, distinct
 * from the app-level one), so a 401 on `whatsapp_business_account` while
 * `instagram` sails through means a wrong secret, not a wrong URL. The body is
 * only read for this log line — never trusted.
 */
function objectTypeForLog(rawBody: string): string {
  try {
    return (JSON.parse(rawBody) as MetaWebhookPayload).object ?? "unknown";
  } catch {
    return "unparseable";
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature)) {
    console.error(
      `[webhook] 401 — signature check failed for object "${objectTypeForLog(rawBody)}" ` +
        `(header ${signature ? "present" : "MISSING"}, tried ${appSecrets().length} secret(s)). ` +
        `If other channels verify fine, this product is signed with a different app secret — ` +
        `set META_APP_SECRET_ALT to the app-level secret from App settings → Basic.`,
    );
    return new Response("Invalid signature", { status: 401 });
  }

  console.log(`[webhook] accepted ${objectTypeForLog(rawBody)} event`);

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  // Meta retries anything that is not a fast 200, so keep the work small
  // here; the reply pipeline runs in `after()`.
  for (const inbound of parsePayload(payload)) {
    await ingest(inbound);
  }

  return NextResponse.json({ received: true });
}
