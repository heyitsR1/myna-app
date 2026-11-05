/**
 * Typed triage of an inbound customer message, via TypeSafe's Jev model.
 *
 * This runs *before* Maya writes anything. Jev does not generate text — it
 * returns judgments with probabilities, so the routing decision stops being
 * something the chat model asserts about itself and becomes something code
 * can branch on.
 *
 * Why this exists, given `lib/reply.ts` already decides an intent:
 *
 *  1. `decision.confidence` is the chat model scoring its own homework. It is
 *     not calibrated — a 70B model writes 0.95 on a reply it invented. Jev's
 *     `confidence` and `noul` are probabilities over a fixed question, which
 *     is a number a threshold can honestly be set against.
 *  2. The BUY_WORDS / SENSITIVE / QUANTITY_CHANGE regexes are a keyword list
 *     standing in for meaning. They miss romanised Nepali the list forgot and
 *     fire on any message containing "return". `is the wayfarer polarised?`
 *     asked after a booking is a question, not an order — the regex cannot
 *     see that, Jev scores it `question` @0.97.
 *  3. Sentiment was previously invisible. An angry customer and a curious one
 *     were routed identically.
 *
 * Failure is never fatal: every error path returns `null`, and `lib/reply.ts`
 * falls back to the regex guards it always used. A demo does not go dark
 * because a third-party API had a bad minute.
 */
import { TypeSafeClient, choice, noul, score, type SystemOneResult } from "@typesafe-ai/sdk";

/** What the shop should do about this message. */
export type TriageIntent =
  | "question"
  | "catalogue"
  | "buy"
  | "complaint"
  | "negotiation"
  | "thanks"
  | "other";

export interface Triage {
  intent: TriageIntent;
  /** Concentration of the intent distribution, 0..1. */
  intentConfidence: number;
  /** Full distribution — kept so the UI can show the runner-up. */
  intentProbabilities: Record<string, number>;
  /** 0 calm · 1 impatient · 2 angry. Expected value, so fractional. */
  frustration: number;
  /** 0 neutral · 1 friendly · 2 delighted. */
  warmth: number;
  /** P(the owner should answer this personally). */
  needsHuman: number;
  /** P(they explicitly asked for a human). */
  asksForHuman: number;
  /** P(the message is abusive, obscene or trolling). Absent on rows stored before 6 Nov. */
  abusive?: number;
  /** Input+output tokens, for cost tracking during the demo. */
  tokens: number;
  latencyMs: number;
  /**
   * The versioned model that actually answered (e.g. `jev-1.13.0`). We send
   * the `jev-latest` alias, and TypeSafe's docs are explicit that `confidence`
   * is computed differently between versions — so if the thresholds in
   * `verdictFor` start behaving oddly, this is the field that says the model
   * moved under us.
   */
  model: string;
}

/**
 * Criteria are written as situations a Kathmandu shop owner would recognise,
 * not as abstract labels. Two are load-bearing and were changed after probing
 * real messages (`scripts/typesafe-smoke.mjs`):
 *
 *  - `catalogue` spells out "without naming one specific item", because
 *    "price please" otherwise reads as a question about a price. The demo
 *    script opens with that exact line.
 *  - the frustration rubric says outright that a short message is not by
 *    itself impatient. Without that sentence "price please" scored 0.78
 *    frustration — the model was reading terseness as annoyance.
 */
const QUESTIONS = {
  intent: choice(
    "Read `customer_message` in the context of `conversation`. What does the shop need to do in response",
    {
      question:
        "Answer a specific question it knows: the price of one named item, delivery, hours, payment methods, whether something is in stock, or return a greeting.",
      catalogue:
        "Show what is for sale. They asked what the shop has, for the list, the collection, or for prices generally, without naming one specific item. This includes romanised Nepali such as \"kati parcha?\", \"kati ho?\", \"dam kati?\" or \"k k cha?\" when no item is named.",
      buy: "Record an order. They want to place, change, or confirm a purchase of a specific item — including giving just a product code or name as their choice.",
      complaint:
        "Resolve a grievance: a late, wrong, missing or defective order, or a request for a refund, return, or exchange.",
      negotiation:
        "Respond to a request for a discount, a lower price, or bulk / wholesale pricing. In Nepal \"last price?\", \"best price?\", \"final price?\", \"kam garnus\", \"sasto\" or \"discount milcha?\" all mean asking for a discount.",
      thanks:
        "Acknowledge thanks, praise, or positive feedback. The customer is not asking for anything new.",
      other:
        "Something else, or something the shop could not answer from its own catalogue and policies.",
    },
  ),
  frustration: score("How impatient or angry is the customer in `customer_message`", [
    "Calm, neutral, or friendly. A short or blunt message is NOT impatient by itself.",
    "Noticeably impatient: chasing a reply, repeating a question that went unanswered, or mild annoyance.",
    "Clearly angry: demanding, accusatory, or threatening to leave, to stop buying, or to post a bad review.",
  ]),
  warmth: score("How pleased or appreciative is the customer in `customer_message`", [
    "Neutral or purely transactional",
    "Polite and friendly",
    "Delighted — thanking warmly, praising the product, or expressing excitement",
  ]),
  needs_human: noul(
    "The shop owner should answer `customer_message` personally instead of letting the automated assistant reply",
    {
      true: "Money is in dispute, the customer is upset, they are negotiating price, they asked for a person, or answering needs information the shop has not written down.",
      false: "A routine question about products, prices, delivery, or availability that a well-informed shop assistant answers every day.",
    },
  ),
  asks_for_human: noul(
    "`customer_message` explicitly asks to speak to a person, the owner, or a real human",
  ),
  // A live audience trolls. Abuse is held with no reply at all, so it gets its
  // own question rather than hoping frustration catches it: a cheerful insult
  // scores calm.
  abusive: noul("`customer_message` is abusive, obscene, a slur, sexual harassment, or obvious trolling", {
    true: "Insults, swearing at the shop or staff (English or Nepali), sexual remarks, slurs, or nonsense sent only to provoke.",
    false: "A genuine message, even if blunt, angry about an order, or joking politely.",
  }),
} as const;

export interface TriageInput {
  brandName: string;
  /** Latest inbound message — the thing being judged. */
  message: string;
  /** Oldest-first recent turns, already trimmed by the caller. */
  history: Array<{ role: "customer" | "shop"; text: string }>;
  /** SKUs currently on a pending order, so "make it 2" reads as a change. */
  pendingOrderSkus: string[];
  /** True when the shop's previous message was the catalogue listing. */
  catalogueJustShown: boolean;
}

/**
 * One request, five questions. They are independent judgments over the same
 * state, so they run in parallel server-side for the price of a single
 * round trip — roughly 800 input tokens and ~1s in practice.
 */
export async function triageMessage(input: TriageInput): Promise<Triage | null> {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) return null; // not configured — caller keeps the regex path

  // Short per-attempt timeout with one retry. The whole reply pipeline runs
  // inside the Worker's `after()` budget (~30s) alongside a 5-8s chat call,
  // so triage must never be the thing that runs it out.
  const client = new TypeSafeClient({ apiKey, timeout: 4000, retry: { maxRetries: 1 } });

  const t0 = Date.now();
  let result: SystemOneResult<typeof QUESTIONS>;
  try {
    result = await client.systemOne({
      state: {
        business: `${input.brandName}, a small business in Nepal selling to customers over Instagram, WhatsApp and Facebook`,
        conversation:
          input.history.length > 0
            ? input.history.map((m) => `${m.role}: ${m.text}`).join("\n")
            : "(no earlier messages)",
        // Stated as plain facts rather than hints about what to answer: the
        // model should weigh them, not be instructed by them.
        catalogue_just_shown: input.catalogueJustShown,
        pending_order_items: input.pendingOrderSkus.length > 0 ? input.pendingOrderSkus : null,
        customer_message: input.message,
      },
      questions: QUESTIONS,
    });
  } catch (err) {
    // Includes auth failures, rate limits, and timeouts — all equally
    // non-fatal here.
    console.error("[triage] TypeSafe call failed, falling back to regex guards:", err);
    return null;
  }

  const a = result.answers;
  return {
    intent: a.intent.choice,
    intentConfidence: a.intent.confidence,
    intentProbabilities: { ...a.intent.probabilities },
    frustration: a.frustration.score,
    warmth: a.warmth.score,
    needsHuman: a.needs_human.noul,
    asksForHuman: a.asks_for_human.noul,
    abusive: a.abusive.noul,
    tokens: result.usage.input_tokens + result.usage.output_tokens,
    latencyMs: Date.now() - t0,
    model: result.model,
  };
}

/**
 * Policy, kept in code and deliberately not in the model.
 *
 * Two of these are absolute rather than threshold-based, because the demo
 * makes a promise about them: Maya never negotiates and never handles a
 * complaint on her own. A probability of 0.42 on `needs_human` for a discount
 * request is a perfectly reasonable judgment — and still not a licence to
 * haggle. So the intent decides, not the number.
 */
/**
 * Why a message is held. The kind picks what the owner is offered:
 * `abuse` gets no draft at all, `negotiation` / `complaint` / `person` get a
 * fixed holding line (never the model's improvised policy — on 5 Nov it
 * drafted "prices are fixed" for a discount ask), `judgment` keeps Maya's own
 * reply as the draft for the owner to check.
 */
export type HoldKind = "abuse" | "negotiation" | "complaint" | "person" | "judgment";

export interface TriageVerdict {
  hold: boolean;
  kind?: HoldKind;
  reason: string;
}

export function verdictFor(t: Triage): TriageVerdict {
  if ((t.abusive ?? 0) >= 0.6) return { hold: true, kind: "abuse", reason: `abusive (p=${t.abusive!.toFixed(2)}) — no auto-reply` };
  if (t.intent === "complaint") return { hold: true, kind: "complaint", reason: "complaint — owner should answer" };
  if (t.intent === "negotiation") return { hold: true, kind: "negotiation", reason: "price negotiation — owner decides discounts" };
  if (t.asksForHuman >= 0.5) return { hold: true, kind: "person", reason: "customer asked for a person" };
  if (t.frustration >= 1.0) return { hold: true, kind: "judgment", reason: `customer sounds upset (${t.frustration.toFixed(1)}/2)` };
  if (t.needsHuman >= 0.6) return { hold: true, kind: "judgment", reason: `needs a human (p=${t.needsHuman.toFixed(2)})` };
  // A low-confidence intent means Jev could not tell what they wanted. Letting
  // Maya answer anyway is how a thread goes wrong in front of an audience.
  if (t.intentConfidence < 0.5) {
    return { hold: true, kind: "judgment", reason: `unclear what they want (${t.intent} @${t.intentConfidence.toFixed(2)})` };
  }
  return { hold: false, reason: `${t.intent} @${t.intentConfidence.toFixed(2)}` };
}

/** Compact one-liner for logs and the health endpoint. */
export function describeTriage(t: Triage): string {
  return (
    `${t.intent}@${t.intentConfidence.toFixed(2)} ` +
    `frust=${t.frustration.toFixed(2)} warmth=${t.warmth.toFixed(2)} ` +
    `human=${t.needsHuman.toFixed(2)} abuse=${(t.abusive ?? 0).toFixed(2)} (${t.tokens}tok ${t.latencyMs}ms)`
  );
}
