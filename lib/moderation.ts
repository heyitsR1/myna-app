/**
 * Phrase lists shared by the reply pipeline (what Maya holds) and the live
 * wall (what the projector may show). Jev is the primary judge; these are
 * floors for the cases it misses and for when TypeSafe is unreachable.
 */
import type { Triage } from "@/lib/triage";

/**
 * A room of strangers tests the swear words first, in English and Nepali.
 * Those never get a cheerful auto-reply, and never reach the big screen.
 */
export const ABUSIVE =
  /\b(fuck\w*|f\*+k|shit\w*|bitch\w*|asshole|bastard|dick(head)?|cunt|slut|whore|muji|machikne|machis|randi|chikne|chikna|khate|lado|puti|boksi|gadha|kukur|bhalu|harami)\b/i;

/**
 * Discount asks, including the Nepali-English ones Jev reads as plain
 * questions ("last price for 2 aviators" scored `question` @0.42).
 */
export const DISCOUNT_ASK =
  /\b(discount\w*|cheaper|negotiat\w*|(best|last|final|less|lowest) price|kam\s*gar\w*|sasto|chhut|ghatau\w*|offers?)\b/i;

export function isAbusive(body: string, triage: Pick<Triage, "abusive"> | null | undefined): boolean {
  return ABUSIVE.test(body) || (triage?.abusive ?? 0) >= 0.5;
}

/** Phone numbers off the projector: any run of 7+ digits (spaces/dashes allowed). */
export function maskContact(text: string): string {
  return text.replace(/(\+?\d[\d\s-]{5,}\d)/g, (m) => (m.replace(/\D/g, "").length >= 7 ? "•••• ••••" : m));
}
