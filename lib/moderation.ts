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
  /\b(\w*fuck\w*|f\*+k|fk+|stfu|wtf|\w*shit\w*|bitch\w*|asshole|bastard|dick(head)?|cunt|slut|whore|porn\w*|muji\w*|mugi|machikne|machikney|machis|randi\w*|chikne|chikney|chikna|khate|lado|puti|boksi|gadha|kukur|bhalu|harami|sala|saala|bhosdi\w*|chutiya|madarchod|behenchod)\b|मुजी|माचिक्ने|मचिक्ने|रण्डी|चिक्ने|खाते|लाडो|पुती|बोक्सी|गधा|कुकुर|हरामी|भालु|साला/i;

/**
 * Discount asks, including the Nepali-English ones Jev reads as plain
 * questions ("last price for 2 aviators" scored `question` @0.42). "offers"
 * on its own is no longer one: the shop has real offers Maya quotes now.
 */
export const DISCOUNT_ASK =
  /\b(discount\w*|cheaper|negotiat\w*|(best|last|final|less|lowest) price|kam\s*gar\w*|sasto|chhut|ghatau\w*|offer\s*(price|rate))\b|\d+\s*%\s*(off|discount|chhut)|छुट|डिस्काउन्ट/i;

/**
 * "What offers do you have this week?": answered from OFFERS (lib/offers.ts),
 * not held. Only when nothing in it asks for a price cut or names a number
 * ("any offer for 2 pairs?" is a multi-buy ask and stays with the owner).
 */
export const OFFERS_ASK = /\b(offers?|promo\w*|deals?|scheme|this week)\b|अफर/i;

export function isOffersQuestion(body: string): boolean {
  return OFFERS_ASK.test(body) && !DISCOUNT_ASK.test(body) && !/\d/.test(body);
}

export function isAbusive(body: string, triage: Pick<Triage, "abusive"> | null | undefined): boolean {
  return ABUSIVE.test(body) || (triage?.abusive ?? 0) >= 0.5;
}

/**
 * Phone numbers and order-check links off the projector: any run of 7+
 * digits (spaces/dashes allowed), and the token in an /o/<token> link, which
 * would let anyone in the room open and edit that customer's order.
 */
export function maskContact(text: string): string {
  return text
    .replace(/https?:\/\/\S+\/o\/[A-Za-z0-9_-]+/g, "🔗 order link")
    .replace(/(\+?\d[\d\s-]{5,}\d)/g, (m) => (m.replace(/\D/g, "").length >= 7 ? "•••• ••••" : m));
}
