/**
 * Holding replies: what the customer gets when Maya must not answer the
 * question herself (a discount, a complaint, a request for a person, abuse)
 * or could not (both models failed or ran out of time).
 *
 * Silence was the bug: until 6 Nov every hold only wrote a draft for the
 * owner, so the customer heard nothing until the owner opened the app. These
 * lines go out at once instead. They are fixed text, never model output, so
 * they can't negotiate or promise anything beyond "the owner will reply", and
 * they mirror the customer's language: English, romanised Nepali, Devanagari.
 */
import type { HoldKind } from "@/lib/triage";

export type Lang = "en" | "rom" | "deva";

/** `fallback`: the models failed or timed out; nothing was decided about the message itself. */
export type HoldingKind = HoldKind | "fallback";

const LINES: Record<HoldingKind, Record<Lang, string>> = {
  negotiation: {
    en: "Let me check that with the owner 🙏 They'll get back to you here shortly.",
    rom: "Yo kura owner sanga sodhera bhanchhu 🙏 Unle chhittai yahi reply garnuhunchha.",
    deva: "यो कुरा म साहुजीसँग सोधेर भन्छु 🙏 उहाँले छिट्टै यहीँ जवाफ दिनुहुन्छ।",
  },
  complaint: {
    en: "Sorry about this 🙏 I've passed it to the owner, who will look into it and reply here shortly.",
    rom: "Maaf garnuhola 🙏 Maile yo kura owner lai pass gareko chhu, unle herera chhittai yahi reply garnuhunchha.",
    deva: "माफ गर्नुहोला 🙏 मैले यो कुरा साहुजीलाई पठाएको छु, उहाँले हेरेर छिट्टै यहीँ जवाफ दिनुहुन्छ।",
  },
  person: {
    en: "Sure! I've let the owner know, they'll reply to you here personally shortly 🙏",
    rom: "Huncha! Maile owner lai bhaneko chhu, unle chhittai yahi reply garnuhunchha 🙏",
    deva: "हुन्छ! मैले साहुजीलाई भनेको छु, उहाँले छिट्टै यहीँ जवाफ दिनुहुन्छ 🙏",
  },
  judgment: {
    en: "Thanks for your message 🙏 I've passed it to the owner, they'll get back to you here shortly.",
    rom: "Message ko lagi dhanyabad 🙏 Maile owner lai pass gareko chhu, unle chhittai yahi reply garnuhunchha.",
    deva: "सन्देशको लागि धन्यवाद 🙏 मैले साहुजीलाई पठाएको छु, उहाँले छिट्टै यहीँ जवाफ दिनुहुन्छ।",
  },
  fallback: {
    en: "Thanks for your message 🙏 I've passed it to the owner, they'll get back to you here shortly.",
    rom: "Message ko lagi dhanyabad 🙏 Maile owner lai pass gareko chhu, unle chhittai yahi reply garnuhunchha.",
    deva: "सन्देशको लागि धन्यवाद 🙏 मैले साहुजीलाई पठाएको छु, उहाँले छिट्टै यहीँ जवाफ दिनुहुन्छ।",
  },
  // Calm and neutral: no scolding, no apology, just the way back to the shop.
  abuse: {
    en: "Let's keep it friendly 🙂 Happy to help whenever you're looking for sunglasses.",
    rom: "Ramrari kura garau na 🙂 Sunglasses chahiyo bhane ma help garna tayar chhu.",
    deva: "राम्रोसँग कुरा गरौँ न 🙂 Sunglasses चाहियो भने म सहयोग गर्न तयार छु।",
  },
};

export function holdingLine(kind: HoldingKind, lang: Lang): string {
  return LINES[kind][lang];
}

const ALL_LINES = new Set(Object.values(LINES).flatMap((byLang) => Object.values(byLang)));

/** True for any holding line in any language: used to avoid sending a second one minutes later. */
export function isHoldingLine(body: string): boolean {
  return ALL_LINES.has(body.trim());
}

const DEVANAGARI = /[ऀ-ॿ]/;

// Common romanised-Nepali words that are not also everyday English. Weighted
// double, because a short Nepali message is usually mixed ("discount milcha?").
const NEPALI = new Set(
  (
    "cha chha xa chaa chhu chu ho hoina hola kati parcha parxa parchha pardaina hajur dai didi bhai bahini " +
    "garnu garnus garnuhos garne gareko garera gardai chahiyo chaiyo chahincha chainxa chahiye ma mero meri malai " +
    "hamro hami tapai tapaai tapailai tapaiko timi timro k ke kina kasari kaha kahile kun kasto ramro ramrai " +
    "dinu dinus dinuhos dinuhuncha deu pathau pathaunu pathaidinu pathaunus milcha milxa milchha mildaina bhayo " +
    "bhaena bhane bhanda ni ta ra ko lai paisa sasto mahango aba chaina xaina chhaina thiyo huncha hunxa " +
    "hunchha hunna dhanyabad dhanyabaad dhanyawad sanchai khoi ani pani tyo yeta uta ghatau chhut maaf hera herna " +
    "sakchu sakincha lagi sathi dam mol wala ota wota ekdam ekdum re rey hai nai kaile kati ko yeha yaha tyaha " +
    "garchu garchhu jau jaau aaunu aauchha pugcha pugchha kinna kinne linchu lincha"
  ).split(/\s+/),
);

const ENGLISH = new Set(
  (
    "the is are was a an i you do does did can could what how much many price please want need have has my your " +
    "it this that these those for to of and with discount thanks thank order give me send why when where which " +
    "will would get any there not no yes deliver delivery sunglasses glasses pair photo photos available in on " +
    "be am just like looking buy talk owner person human someone real refund return broken"
  ).split(/\s+/),
);

function score(text: string): { rom: number; en: number; deva: boolean } {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  let rom = 0;
  let en = 0;
  for (const w of words) {
    if (NEPALI.has(w)) rom += 2;
    else if (ENGLISH.has(w)) en += 1;
  }
  return { rom, en, deva: DEVANAGARI.test(text) };
}

/**
 * The customer's language, from their latest message, or from their earlier
 * ones when the latest says nothing either way ("?", "hello", "ok").
 * `messages` is oldest first. English when nothing tells.
 */
export function detectLang(messages: string[]): Lang {
  for (let i = messages.length - 1; i >= Math.max(0, messages.length - 4); i--) {
    const s = score(messages[i]);
    if (s.deva) return "deva";
    if (s.rom > s.en) return "rom";
    if (s.en > s.rom) return "en";
  }
  return "en";
}
