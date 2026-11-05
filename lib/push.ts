/**
 * Owner notifications over Web Push, with nothing but WebCrypto, so it runs
 * the same in `next dev` (Node) and on the Cloudflare Worker.
 *
 *  - Payload encryption: RFC 8291 (`aes128gcm`, RFC 8188 single record).
 *  - Sender identity: RFC 8292 VAPID, an ES256 JWT per push service origin.
 *
 * The pipeline calls `notifyOwner()` and forgets about it: it never throws,
 * fans out to every stored subscription in parallel, and prunes
 * subscriptions the push service says are gone (404 / 410).
 *
 * Env:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  base64url, 65-byte uncompressed P-256 point
 *   VAPID_PRIVATE_KEY             base64url, 32-byte P-256 scalar (secret)
 *   VAPID_SUBJECT                 mailto: or https: contact for push services
 */
import { getSupabaseAdmin } from "@/lib/supabase";

export type OwnerEventKind = "order" | "handoff" | "autoconfirmed" | "test";

export interface OwnerEvent {
  kind: "order" | "handoff" | "autoconfirmed";
  title: string;
  body: string;
  /** Same-origin path the notification opens, e.g. `/orders/<id>`. */
  url: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushReport {
  configured: boolean;
  subscriptions: number;
  delivered: number;
  removed: number;
  failed: { endpoint: string; status: number | null; error: string }[];
}

const enc = new TextEncoder();

// ── base64url ────────────────────────────────────────────────────────────

export function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ── VAPID (RFC 8292) ─────────────────────────────────────────────────────

interface VapidKeys {
  publicKey: string;
  privateKey: CryptoKey;
  subject: string;
}

let vapidCache: Promise<VapidKeys | null> | null = null;

function loadVapid(): Promise<VapidKeys | null> {
  vapidCache ??= (async () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "https://myna-app.aarohan567.workers.dev";
    if (!publicKey || !privateKey) return null;
    const point = b64urlDecode(publicKey);
    if (point.length !== 65 || point[0] !== 4) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not a P-256 point");
    // WebCrypto cannot import a bare private scalar, so wrap it in a JWK
    // together with the public point's coordinates.
    const key = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        d: privateKey,
        x: b64urlEncode(point.slice(1, 33)),
        y: b64urlEncode(point.slice(33, 65)),
        ext: false,
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    return { publicKey, privateKey: key, subject };
  })().catch((error) => {
    console.error("[push] VAPID keys unusable:", error instanceof Error ? error.message : error);
    vapidCache = null;
    return null;
  });
  return vapidCache;
}

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

async function vapidAuthorization(endpoint: string, vapid: VapidKeys): Promise<string> {
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  // WebCrypto's ECDSA output is already the raw r||s form JWS wants.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    vapid.privateKey,
    enc.encode(unsigned),
  );
  return `vapid t=${unsigned}.${b64urlEncode(signature)}, k=${vapid.publicKey}`;
}

// ── payload encryption (RFC 8291 / RFC 8188) ─────────────────────────────

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** Encrypt one payload for one subscription; returns the full request body. */
export async function encryptPayload(
  subscription: Pick<PushSubscriptionRecord, "p256dh" | "auth">,
  plaintext: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = b64urlDecode(subscription.p256dh);
  const authSecret = b64urlDecode(subscription.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error("malformed subscription keys");

  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256),
  );

  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // A single record: the payload, then the 0x02 "last record" delimiter.
  const record = concat(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record));

  // Header: salt(16) | record size(4, BE) | key id length(1) | key id (our public key).
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

export interface PushRequest {
  endpoint: string;
  headers: Record<string, string>;
  body: Uint8Array<ArrayBuffer>;
}

/** Build (but don't send) the encrypted, VAPID-signed request for one subscription. */
export async function buildPushRequest(
  subscription: PushSubscriptionRecord,
  payload: unknown,
  options: { ttl?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string } = {},
): Promise<PushRequest> {
  const vapid = await loadVapid();
  if (!vapid) throw new Error("VAPID keys are not configured");
  const body = await encryptPayload(subscription, enc.encode(JSON.stringify(payload)));
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(subscription.endpoint, vapid),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(options.ttl ?? 24 * 60 * 60),
    Urgency: options.urgency ?? "high",
  };
  // Topic must be ≤32 base64url chars; it collapses undelivered pushes server-side.
  const topic = options.topic?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  if (topic) headers.Topic = topic;
  return { endpoint: subscription.endpoint, headers, body };
}

// ── fan-out ──────────────────────────────────────────────────────────────

/** Send one payload to every stored subscription. Never throws. */
export async function sendToAllSubscriptions(payload: {
  kind: OwnerEventKind;
  title: string;
  body: string;
  url: string;
  tag?: string;
}): Promise<PushReport> {
  const report: PushReport = { configured: pushConfigured(), subscriptions: 0, delivered: 0, removed: 0, failed: [] };
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase || !report.configured) return report;

    const { data, error } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
    if (error) {
      console.error("[push] could not read subscriptions:", error.message);
      return report;
    }
    const subscriptions = (data ?? []) as PushSubscriptionRecord[];
    report.subscriptions = subscriptions.length;
    if (subscriptions.length === 0) return report;

    const message = { ...payload, url: payload.url.startsWith("/") ? payload.url : "/m", sentAt: Date.now() };
    const gone: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const request = await buildPushRequest(sub, message, { topic: payload.tag });
          const res = await fetch(request.endpoint, {
            method: "POST",
            headers: request.headers,
            body: request.body,
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            report.delivered++;
            return;
          }
          const detail = (await res.text().catch(() => "")).slice(0, 200);
          if (res.status === 404 || res.status === 410) gone.push(sub.endpoint);
          report.failed.push({ endpoint: shortEndpoint(sub.endpoint), status: res.status, error: detail || res.statusText });
        } catch (error) {
          report.failed.push({
            endpoint: shortEndpoint(sub.endpoint),
            status: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );

    if (gone.length) {
      const { error: deleteError } = await supabase.from("push_subscriptions").delete().in("endpoint", gone);
      if (!deleteError) report.removed = gone.length;
    }
    if (report.failed.length) console.error("[push] failures:", JSON.stringify(report.failed));
  } catch (error) {
    console.error("[push] send failed:", error instanceof Error ? error.message : error);
  }
  return report;
}

function shortEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.host}/…${endpoint.slice(-8)}`;
  } catch {
    return "invalid endpoint";
  }
}

/**
 * The one call the reply pipeline makes when something needs the owner (or
 * Maya confirmed an order on Autopilot). Sends to every device the owner
 * turned notifications on for. Never throws; failures are logged.
 */
export async function notifyOwner(event: OwnerEvent): Promise<void> {
  try {
    const report = await sendToAllSubscriptions({
      kind: event.kind,
      title: event.title,
      body: event.body,
      url: event.url,
      tag: event.tag,
    });
    if (report.configured && report.subscriptions > 0) {
      console.log(`[push] ${event.kind} → ${report.delivered}/${report.subscriptions} delivered`);
    }
  } catch (error) {
    console.error("[push] notifyOwner failed:", error instanceof Error ? error.message : error);
  }
}

/**
 * Whether Maya may confirm orders herself for this brand. Defaults to off,
 * including when the column or the database is missing, so a failure here
 * always falls back to the owner confirming by hand.
 */
export async function autopilotEnabled(brandId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase || !brandId) return false;
    const { data, error } = await supabase.from("brands").select("autopilot").eq("id", brandId).maybeSingle();
    if (error || !data) return false;
    return data.autopilot === true;
  } catch {
    return false;
  }
}
