/**
 * Fetch a photo a customer sent so Maya can look at it.
 *
 * WhatsApp gives a media id: GET /{id} with the WhatsApp token returns a
 * short-lived url (about 5 minutes), which is also fetched with the token.
 * Instagram and Messenger give a signed CDN url that needs no token.
 * Claude takes images as base64; anything over 5 MB or not an image is
 * skipped. Never throws: a photo we can't see just means Maya asks about it.
 */
import type { Message } from "@/lib/types";

const G = "https://graph.facebook.com/v23.0";
const MAX_BYTES = 5 * 1024 * 1024;
const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export interface ImageData {
  media_type: string;
  data: string;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export async function fetchImage(media: NonNullable<Message["media"]>): Promise<ImageData | null> {
  try {
    let url = media.url ?? null;
    const headers: Record<string, string> = {};
    if (media.wa_media_id) {
      const token = process.env.WA_ACCESS_TOKEN;
      if (!token) return null;
      headers.Authorization = `Bearer ${token}`;
      const meta = await fetch(`${G}/${media.wa_media_id}`, { headers });
      if (!meta.ok) return null;
      url = ((await meta.json()) as { url?: string }).url ?? null;
    }
    if (!url) return null;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? media.mime ?? "image/jpeg").split(";")[0].trim();
    if (!OK_TYPES.has(type)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return null;
    return { media_type: type, data: toBase64(buf) };
  } catch (err) {
    console.error("[media] could not fetch customer photo:", err);
    return null;
  }
}
