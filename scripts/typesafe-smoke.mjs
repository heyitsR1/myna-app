#!/usr/bin/env node
/**
 * Probe Jev against the messages Myna actually sees. Verifies the API key,
 * prints latency and token cost, and shows where each judgment lands across
 * the demo's real message types — including the two cases that used to be
 * handled by regex and got them wrong.
 *
 *   node --env-file=.env.local scripts/typesafe-smoke.mjs
 *
 * The questions below MIRROR `lib/triage.ts`. They are duplicated rather than
 * imported because this is a plain .mjs script and triage.ts is TypeScript
 * behind the `@/` alias. If you change the criteria there, change them here,
 * or this script will cheerfully validate a question set the app never uses.
 */
import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();

const QUESTIONS = {
  intent: choice(
    "Read `customer_message` in the context of `conversation`. What does the shop need to do in response",
    {
      question:
        "Answer a specific question it knows: the price of one named item, delivery, hours, payment methods, whether something is in stock, or return a greeting.",
      catalogue:
        "Show what is for sale. They asked what the shop has, for the list, the collection, or for prices generally, without naming one specific item.",
      buy: "Record an order. They want to place, change, or confirm a purchase of a specific item — including giving just a product code or name as their choice.",
      complaint:
        "Resolve a grievance: a late, wrong, missing or defective order, or a request for a refund, return, or exchange.",
      negotiation:
        "Respond to a request for a discount, a lower price, or bulk / wholesale pricing.",
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
};

/** [message, conversation-so-far, label, expected intent or null if unasserted] */
const PROBES = [
  ["hello", "(no earlier messages)", "greeting", "question"],
  ["price please", "(no earlier messages)", "wants list", "catalogue"],
  [
    "MS-03",
    "shop: Here is what we have right now: MS-01 … MS-05. Reply with the code or name to book one",
    "bare code after catalogue",
    "buy",
  ],
  ["do you deliver to Pokhara? how many days", "(no earlier messages)", "delivery", "question"],
  ["yo kati ho? ani delivery kati dinma aauxa", "(no earlier messages)", "romanised Nepali", "question"],
  [
    "is the wayfarer polarised?",
    "customer: I'll take the wayfarer\nshop: ✅ Order #3 booked & saved!",
    "question AFTER a booking — the old regex opened order #2 here",
    "question",
  ],
  ["can you give discount if I take 2 pairs?", "(no earlier messages)", "negotiation", "negotiation"],
  [
    "this is the third time im asking. where is my order?? i paid 2 weeks ago and nobody replies. refund me now",
    "(no earlier messages)",
    "angry complaint",
    "complaint",
  ],
  [
    "thank you so much bhai, the glasses are perfect! 😍 will order again",
    "(no earlier messages)",
    "delighted",
    "thanks",
  ],
  ["can I talk to the owner please", "(no earlier messages)", "asks for human", null],
  [
    "hello?? anyone there?",
    "customer: do you deliver to Bhaktapur?\n(no reply was sent)",
    "chasing an unanswered question",
    null,
  ],
];

console.log("models:", (await client.models.list()).map((m) => m.name).join(", "), "\n");

const t0 = Date.now();
const results = await Promise.all(
  PROBES.map(async ([text, conversation, label, expected]) => {
    const r = await client.systemOne({
      state: {
        business:
          "Monso, a small eyewear shop in Kathmandu selling sunglasses over Instagram, WhatsApp and Facebook",
        conversation,
        customer_message: text,
      },
      questions: QUESTIONS,
    });
    return { text, label, expected, a: r.answers, u: r.usage, model: r.model };
  }),
);

let totalIn = 0;
let failures = 0;
for (const { text, label, expected, a, u } of results) {
  totalIn += u.input_tokens;
  const ok = expected === null || a.intent.choice === expected;
  if (!ok) failures += 1;
  const mark = expected === null ? "·" : ok ? "✓" : "✗";
  console.log(`${mark} "${text.slice(0, 54)}${text.length > 54 ? "…" : ""}"  (${label})`);
  console.log(
    `    intent=${a.intent.choice}@${a.intent.confidence.toFixed(2)}` +
      `  frust=${a.frustration.score.toFixed(2)}` +
      `  warmth=${a.warmth.score.toFixed(2)}` +
      `  owner=${a.needs_human.noul.toFixed(2)}` +
      `  asks_human=${a.asks_for_human.noul.toFixed(2)}` +
      (ok ? "" : `   EXPECTED ${expected}`),
  );
}

// Input tokens only — TypeSafe does not bill output tokens.
const usd = (totalIn / 1_000_000) * 0.042;
console.log(
  `\n${results.length} messages in ${Date.now() - t0}ms (parallel) · model ${results[0].model}` +
    `\n${totalIn} input tokens ≈ $${usd.toFixed(6)} — about $${((usd / results.length) * 1000).toFixed(3)} per 1000 messages`,
);
console.log(failures === 0 ? "\nall asserted intents correct" : `\n${failures} intent mismatch(es)`);
process.exit(failures === 0 ? 0 : 1);
