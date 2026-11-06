/**
 * This week's offers, the only ones Maya may quote. One source for her
 * prompt (Claude and the Llama fallback) and for the customer's order page,
 * so what she says and what the page shows can't drift apart. The brand
 * guide (scripts/demo/monso-eyewear-guide.md) says the same for retrieval.
 *
 * Deliberately no percentage or multi-buy discount: discounts stay the
 * owner's call, and a "10% for 2?" ask is still held for them.
 */

export const OFFERS = {
  freeCase: "A free hard case with every pair.",
  freeValleyDelivery: "Free delivery inside Kathmandu valley (Kathmandu, Lalitpur, Bhaktapur).",
} as const;

export function offersForPrompt(): string {
  return `- ${OFFERS.freeValleyDelivery}\n- ${OFFERS.freeCase}`;
}

/** Places a customer might write that are inside Kathmandu valley. */
const VALLEY =
  /\b(kathmandu|ktm|kathmandau|lalitpur|patan|bhaktapur|bhaktpur|kirtipur|madhyapur|thimi|koteshwor|koteshwar|baneshwor|baneshwar|thamel|jhamsikhel|sanepa|kupondole|pulchowk|jawalakhel|lagankhel|satdobato|imadol|gwarko|boudha|bouddha|chabahil|chabhil|kalanki|balaju|maharajgunj|lazimpat|baluwatar|naxal|putalisadak|new\s*road|sundhara|tripureshwor|kalimati|sitapaila|dillibazar|gaushala|sinamangal|tinkune|jorpati|gongabu|samakhushi|bansbari|budhanilkantha|tokha|swayambhu|maitighar|battisputali|mahalaxmisthan|lubhu|chapagaun|godawari|sankhu|kapan|basundhara|dhapasi|nakhipot|bhaisepati|chobhar|kuleshwor|teku|thapathali|bagbazar|anamnagar|old\s*baneshwor|suryabinayak|sallaghari|lokanthali|jadibuti|pepsicola|bhainsepati|ekantakuna|nakkhu|harisiddhi|khumaltar|hattiban|dhobighat)\b|काठमाडौं|काठमाडौँ|ललितपुर|भक्तपुर|पाटन|कोटेश्वर|बानेश्वर/i;

/** True when the address names a place in the valley; null when it is missing or we can't tell. */
export function inValley(address: string | null | undefined): boolean | null {
  if (!address?.trim()) return null;
  return VALLEY.test(address) ? true : null;
}

/** The offers that apply to an order with this address, as short lines for the order page. */
export function offersApplied(address: string | null | undefined): string[] {
  const lines = ["Free hard case with every pair"];
  if (inValley(address)) lines.push("Free delivery inside Kathmandu valley");
  return lines;
}
