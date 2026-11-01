import { chatJSON, type ChatMessage } from "@/lib/llm";
import { getSupabaseAdmin } from "@/lib/supabase";
import { retrieveContext, type RetrievedChunk } from "@/lib/rag";
import { envAccountFor, envTokenFor, sendMessage } from "@/lib/meta";
import {
  catalogueForPrompt,
  formatCatalogue,
  formatNpr,
  listProducts,
  matchProduct,
} from "@/lib/orders";
import { describeTriage, triageMessage, verdictFor } from "@/lib/triage";
import type { AiSource, Message, OrderItem, Product } from "@/lib/types";

/**
 * Maya sends on her own unless the model says a human is needed. The
 * confidence bar is a floor against garbage, not a gate: routine questions
 * (hello, price, delivery, "is this available") are not worth an owner's
 * time. Only `handoff` — complaints, refunds, negotiation, off-script — is.
 */
const CONFIDENCE_FLOOR = 0.5;

type Intent = "answer" | "catalogue" | "book_order" | "handoff";

interface MayaDecision {
  intent: Intent;
  reply: string;
  confidence: number;
  reason: string;
  order_sku: string;
  order_quantity: number;
  customer_name: string;
  delivery_address: string;
  phone: string;
}

// Flat on purpose: Ollama's structured-output grammar is happiest with
// required scalar fields. "Not applicable" is the empty string / 0.
const DECISION_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["answer", "catalogue", "book_order", "handoff"] },
    reply: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" },
    order_sku: { type: "string" },
    order_quantity: { type: "integer", minimum: 0 },
    customer_name: { type: "string" },
    delivery_address: { type: "string" },
    phone: { type: "string" },
  },
  required: [
    "intent",
    "reply",
    "confidence",
    "reason",
    "order_sku",
    "order_quantity",
    "customer_name",
    "delivery_address",
    "phone",
  ],
} as const;

function buildSystemPrompt(
  brandName: string,
  toneNotes: string | null,
  chunks: RetrievedChunk[],
  products: Product[],
): string {
  const context =
    chunks.length > 0
      ? chunks
          .map((c, i) => `[Source ${i + 1}] (similarity ${c.similarity.toFixed(2)})\n${c.content}`)
          .join("\n\n")
      : "(no brand documents matched this question)";

  return `You are Maya, the assistant for ${brandName}, a small business in Nepal. You reply to customer messages on Instagram, WhatsApp, and Facebook on the owner's behalf.

Voice: warm, friendly Nepali-SMB register — the way a shop owner in Kathmandu talks to a valued customer. Short sentences, a light Nepali-English mix is fine, 🙏 is welcome. Never pushy, never corporate. Keep replies under 60 words.
${toneNotes ? `\nOwner's tone notes:\n${toneNotes}\n` : ""}
Answer ONLY from the catalogue and brand context below. Never invent prices, policies, stock, dates, or delivery promises.

Catalogue (exact prices in NPR — quote these, nothing else):
${catalogueForPrompt(products)}

Brand context:
${context}

Pick ONE intent for the latest customer message, using the whole conversation:
- "answer": a normal question or greeting you can answer from the catalogue/context (hours, delivery, payment, one item's price, availability, small talk). Reply directly.
- "catalogue": the customer asks what you sell, wants the list, the price list, the collection, or "price please" without naming an item. Write ONLY a one-line friendly intro ending with a colon — the full list is appended automatically after your text, do NOT list items yourself.
- "book_order": the LATEST message itself says they want to buy/book/order a specific item from the catalogue ("I'll take the aviator", "book MS-03", "2 of number 4", or just "MS-03" right after seeing the list). Fill order_sku with the catalogue SKU, order_quantity (default 1), and any name / delivery address / phone they have given so far (empty string if not given). A question ABOUT a product (is it polarised, do you deliver, is it in stock) is "answer", never "book_order" — even if an order was discussed earlier in the conversation. Never book the same item twice unless they ask for more.
- "handoff": ONLY when a human must step in — a complaint or an upset customer, refund / return dispute, discount or price negotiation, bulk or wholesale pricing, a custom request, the customer explicitly asks for a person, or the answer genuinely is not in the catalogue/context. Write a short holding reply ("a team member will get back to you shortly").

Do not hand off simple things. A greeting, a price, a delivery question, or a vague message you can politely answer is never a handoff.

Always write a complete natural reply in "reply", whatever the intent (for book_order and catalogue the system may replace or extend it).

Respond with a single JSON object and nothing else:
{"intent": "answer"|"catalogue"|"book_order"|"handoff", "reply": "<message in the owner's voice>", "confidence": <0..1>, "reason": "<one short sentence>", "order_sku": "<SKU or empty>", "order_quantity": <integer, 0 if none>, "customer_name": "<or empty>", "delivery_address": "<or empty>", "phone": "<or empty>"}`;
}

/**
 * The model over-triggers "book_order" once a thread contains an order —
 * a delivery question after a booking came back as a second booking. So a
 * booking must be visible in the latest message itself: a buy word (English
 * or romanised Nepali), or a bare product reference right after the
 * catalogue was shown. Anything else is downgraded to a plain answer.
 */
const BUY_WORDS =
  /\b(buy|book|order|take|purchase|get me|send me|i'?ll have|i will have|i want|confirm|reserve|kin(n|ch|d)\w*|lin?ch?u|chahi(yo|nchha)|dinu|dinus|pathai?\w*|garnu|garne|lincha|xa)\b/i;

const SENSITIVE =
  /\b(discount|cheaper|negotiat\w*|best price|last price|refund|money back|return it|exchange|complain\w*|broken|damaged|scratch\w*|fake|scam|wholesale|bulk|manager|human|real person|sasto|chhut|ghatau\w*|paisa firta)\b/i;

/**
 * A generic price / "what do you have" ask with no item named, in English,
 * romanised Nepali or Devanagari. Jev scored "kati parcha?" (how much?) as a
 * `question`, so Maya answered availability instead of showing the list.
 */
const PRICE_LIST_ASK =
  /(\b(kati\s*(ho|parch?ha|parcha|parxa|pardaina|ho\s*dam|ma)?|dam\s*kati|mol\s*kati|rate\s*kati|price\s*(list|please|plz|pls)?|prices|rates?|k\s*k\s*(cha|xa|chha)|ke\s*ke\s*(cha|xa|chha)|what\s+do\s+you\s+(sell|have)|collection|catalog(ue)?)\b|कति|मूल्य|के के छ)/i;

const QUANTITY_CHANGE = /\b(make it|change (it )?to|instead)\b|\b\d+\s*(pairs?|pieces?|pcs|ota|wota)\b/i;

function isBareProductRef(latest: string, lastAssistant: string | null, products: Product[]): Product | null {
  const afterCatalogue = Boolean(lastAssistant && lastAssistant.includes("to book one"));
  const short = latest.trim().length <= 40;
  return afterCatalogue && short ? matchProduct(products, latest) : null;
}

function bookingIsExplicit(latest: string, lastAssistant: string | null, products: Product[]): boolean {
  return BUY_WORDS.test(latest) || QUANTITY_CHANGE.test(latest) || isBareProductRef(latest, lastAssistant, products) !== null;
}

/** "2 pairs", "make it 3", "3 ota" → 3; otherwise null. */
function quantityIn(text: string): number | null {
  const m = text.match(/\b(\d{1,2})\s*(pairs?|pieces?|pcs|ota|wota|of)?\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 20 ? n : null;
}

function parseDecision(raw: string): MayaDecision | null {
  const attempt = (s: string): MayaDecision | null => {
    try {
      const p = JSON.parse(s);
      const intents: Intent[] = ["answer", "catalogue", "book_order", "handoff"];
      if (!intents.includes(p.intent) || typeof p.reply !== "string") return null;
      const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      return {
        intent: p.intent,
        reply: p.reply,
        confidence: typeof p.confidence === "number" ? p.confidence : 0.5,
        reason: str(p.reason),
        order_sku: str(p.order_sku),
        order_quantity: Number.isFinite(p.order_quantity) ? Math.max(0, Math.round(p.order_quantity)) : 0,
        customer_name: str(p.customer_name),
        delivery_address: str(p.delivery_address),
        phone: str(p.phone),
      };
    } catch {
      return null;
    }
  };
  const direct = attempt(raw.trim());
  if (direct) return direct;
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? attempt(match[0]) : null;
}

export async function generateAndSendReply(
  conversationId: string,
  inboundMessageId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn("[reply] Supabase not configured; skipping AI reply");
    return;
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*, channel_connections(*), brands(*)")
    .eq("id", conversationId)
    .single();
  if (!conversation) {
    console.error("[reply] conversation not found:", conversationId);
    return;
  }

  const { data: inbound } = await supabase
    .from("messages")
    .select("*")
    .eq("id", inboundMessageId)
    .single();
  if (!inbound) {
    console.error("[reply] inbound message not found:", inboundMessageId);
    return;
  }

  const { data: recent } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .in("status", ["sent", "failed"])
    .order("created_at", { ascending: false })
    .limit(12);
  const history = ((recent ?? []) as Message[]).reverse();

  const brand = conversation.brands;

  const holdForHuman = async (reason: string, decision?: MayaDecision, sources?: AiSource[]) => {
    if (decision?.reply) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        direction: "outbound",
        sender_type: "ai",
        body: decision.reply,
        ai_confidence: decision.confidence,
        ai_sources: sources ?? null,
        status: "draft_pending",
      });
    }
    await supabase.from("conversations").update({ status: "needs_human" }).eq("id", conversationId);
    console.log(`[reply] held for human (${conversationId}): ${reason}`);
  };

  const lastAssistant = [...history].reverse().find((m) => m.direction === "outbound")?.body ?? null;

  // Pulled up from below: triage wants the pending SKUs as state, so that a
  // "make it 2 pairs" reads as changing an order rather than opening one.
  const { data: pendingOrdersData } = await supabase
    .from("orders")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  const pendingOrders = pendingOrdersData ?? [];

  // Triage rides alongside retrieval instead of running before it: it needs
  // none of the RAG output, and at ~1s it hides entirely behind the embedding
  // call and vector search it shares this Promise.all with. Net cost to the
  // pipeline is therefore close to zero.
  const [chunks, products, triage] = await Promise.all([
    retrieveContext(brand.id, inbound.body, 4).catch((err) => {
      console.error("[reply] retrieval failed (is Ollama running?):", err);
      return [] as RetrievedChunk[];
    }),
    listProducts(brand.id),
    triageMessage({
      brandName: brand.name,
      message: inbound.body,
      history: history.map((m) => ({
        role: m.direction === "inbound" ? ("customer" as const) : ("shop" as const),
        text: m.body,
      })),
      pendingOrderSkus: pendingOrders.flatMap((o) =>
        (o.items as OrderItem[]).map((i) => i.sku),
      ),
      catalogueJustShown: Boolean(lastAssistant?.includes("to book one")),
    }),
  ]);

  // Store the judgment next to the message it describes, and denormalise the
  // three values the inbox list reads onto the conversation row. Done here
  // rather than inside each send/hold branch so it lands even when the chat
  // model later fails — knowing the customer is angry is useful precisely
  // when Maya could not answer them.
  if (triage) {
    await Promise.all([
      supabase.from("messages").update({ triage }).eq("id", inboundMessageId),
      supabase
        .from("conversations")
        .update({
          last_intent: triage.intent,
          last_frustration: triage.frustration,
          last_warmth: triage.warmth,
        })
        .eq("id", conversationId),
    ]);
  }

  const messages: ChatMessage[] = history.map((m) => ({
    role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    content: m.body,
  }));
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    messages.push({ role: "user", content: inbound.body });
  }

  let raw: string;
  try {
    raw = await chatJSON(
      buildSystemPrompt(brand.name, brand.tone_notes, chunks, products),
      messages,
      DECISION_SCHEMA as unknown as Record<string, unknown>,
    );
  } catch (err) {
    console.error("[reply] LLM request failed (is Ollama running?):", err);
    await holdForHuman("LLM unavailable");
    return;
  }

  const decision = parseDecision(raw);
  if (!decision) {
    console.error("[reply] could not parse decision JSON:", raw.slice(0, 300));
    await holdForHuman("unparseable model output");
    return;
  }
  const pendingOrder = pendingOrders[0] ?? null;

  // Routing authority now sits with Jev rather than with the chat model's
  // opinion of its own output, or with a keyword list. `verdictFor` holds the
  // policy; SENSITIVE survives only as the fallback for when TypeSafe is
  // unreachable, which is the one path that still consults it.
  let triageHold: string | null = null;
  if (triage) {
    console.log(`[triage] ${describeTriage(triage)} (${conversationId})`);
    const verdict = verdictFor(triage);
    if (verdict.hold) triageHold = verdict.reason;

    // Where the two models disagree about whether this message is a purchase,
    // Jev wins. The chat model drifts toward book_order once a thread contains
    // an order at all — the bug that kept opening order #2 for a delivery
    // question. Jev reads the same message in context and scores it `question`.
    if (decision.intent === "book_order" && triage.intent !== "buy" && triage.intentConfidence >= 0.6) {
      console.log(`[reply] downgraded book_order → answer: Jev read this as ${triage.intent}`);
      decision.intent = "answer";
    }
    if (decision.intent !== "catalogue" && triage.intent === "catalogue" && triage.intentConfidence >= 0.8) {
      console.log("[reply] upgraded → catalogue: Jev read this as a request for the list");
      decision.intent = "catalogue";
    }
  } else if (decision.intent !== "handoff" && SENSITIVE.test(inbound.body)) {
    console.log(
      `[reply] forced handoff: sensitive words in "${inbound.body.slice(0, 60)}" (triage unavailable)`,
    );
    decision.intent = "handoff";
  }

  if (
    decision.intent === "answer" &&
    !triageHold &&
    products.length > 0 &&
    inbound.body.trim().length <= 60 &&
    PRICE_LIST_ASK.test(inbound.body) &&
    !matchProduct(products, inbound.body)
  ) {
    console.log(`[reply] upgraded → catalogue: generic price ask "${inbound.body.slice(0, 60)}"`);
    decision.intent = "catalogue";
  }

  if (decision.intent === "book_order" && !bookingIsExplicit(inbound.body, lastAssistant, products)) {
    console.log(`[reply] downgraded book_order → answer: no buy intent in "${inbound.body.slice(0, 60)}"`);
    decision.intent = "answer";
  } else if (decision.intent === "answer" || decision.intent === "catalogue") {
    // The model sometimes narrates a booking ("your order is booked!") without
    // choosing book_order — which would promise something nothing saved. Two
    // unambiguous shapes are upgraded server-side: a bare product code right
    // after the catalogue, and a quantity change on an order already pending.
    const bare = isBareProductRef(inbound.body, lastAssistant, products);
    if (bare) {
      decision.intent = "book_order";
      decision.order_sku = bare.sku;
      console.log(`[reply] upgraded → book_order: bare product ref ${bare.sku}`);
    } else if (pendingOrder && QUANTITY_CHANGE.test(inbound.body) && quantityIn(inbound.body)) {
      decision.intent = "book_order";
      decision.order_sku = (pendingOrder.items as OrderItem[])[0]?.sku ?? decision.order_sku;
      decision.order_quantity = quantityIn(inbound.body) ?? decision.order_quantity;
      console.log(`[reply] upgraded → book_order: quantity change on pending #${pendingOrder.order_number}`);
    }
  }
  console.log(
    `[reply] ${decision.intent} @${decision.confidence.toFixed(2)} (${conversationId}): ${decision.reason}`,
  );

  const sources: AiSource[] = chunks.map((c) => ({
    document_id: c.document_id,
    similarity: c.similarity,
    excerpt: c.content.slice(0, 160),
  }));

  if (!conversation.ai_enabled) {
    await holdForHuman("Maya paused on this thread", decision, sources);
    return;
  }
  // Jev's verdict outranks the chat model's own intent: it is a probability
  // over a fixed question rather than a number the writer assigned itself.
  if (triageHold) {
    await holdForHuman(triageHold, decision, sources);
    return;
  }
  if (decision.intent === "handoff" || decision.confidence < CONFIDENCE_FLOOR) {
    await holdForHuman(decision.reason || "handoff", decision, sources);
    return;
  }

  // ── Build the outbound text ─────────────────────────────────────────────
  let text = decision.reply.trim();
  let bookedOrderId: string | null = null;

  if (decision.intent === "catalogue") {
    const intro = text || "Namaste! 🙏 Here is what we have right now:";
    text = products.length
      ? `${intro}\n\n${formatCatalogue(products)}\n\nReply with the code or name to book one 😊`
      : `${intro}\n\n(The catalogue is being updated — a team member will share it shortly.)`;
  }

  if (decision.intent === "book_order") {
    const product = matchProduct(products, decision.order_sku) ?? matchProduct(products, inbound.body);
    if (!product) {
      await holdForHuman(`could not match "${decision.order_sku}" to a product`, decision, sources);
      return;
    }
    if (!product.in_stock) {
      text = `Sorry, ${product.name} is out of stock right now 🙏 A team member will let you know when it is back.`;
      await holdForHuman(`order for out-of-stock ${product.sku}`, { ...decision, reply: text }, sources);
      return;
    }
    const quantity = Math.max(1, decision.order_quantity || quantityIn(inbound.body) || 1);
    const unitPrice = Number(product.price);
    const items: OrderItem[] = [{ sku: product.sku, name: product.name, quantity, unit_price: unitPrice }];
    const total = unitPrice * quantity;
    const sameSku = pendingOrders?.find((o) => (o.items as OrderItem[])[0]?.sku === product.sku) ?? null;
    const fields = {
      items,
      total,
      customer_name: decision.customer_name || sameSku?.customer_name || conversation.customer_name || null,
      delivery_address: decision.delivery_address || sameSku?.delivery_address || null,
      phone: decision.phone || sameSku?.phone || null,
    };
    const { data: order, error: orderError } = sameSku
      ? await supabase.from("orders").update(fields).eq("id", sameSku.id).select().single()
      : await supabase
          .from("orders")
          .insert({ brand_id: brand.id, conversation_id: conversationId, status: "pending", ...fields })
          .select()
          .single();
    if (orderError || !order) {
      console.error("[reply] order insert failed:", orderError?.message);
      await holdForHuman("order insert failed", decision, sources);
      return;
    }
    bookedOrderId = order.id;
    const missing = [
      !order.delivery_address && "delivery address",
      !order.phone && "phone number",
    ].filter(Boolean) as string[];
    text =
      `✅ Order ${sameSku ? "updated" : "booked"} & saved!\n` +
      `#${order.order_number} · ${product.name} (${product.sku}) × ${quantity} · ${formatNpr(total)}\n\n` +
      (missing.length ? `Please send your ${missing.join(" and ")} so we can arrange delivery. ` : "") +
      `We'll get back to you shortly to confirm the order 🙏`;
  }

  // ── Send ────────────────────────────────────────────────────────────────
  const connection = conversation.channel_connections;
  const channel = connection?.channel ?? null;
  const accountId = connection?.external_account_id ?? (channel ? envAccountFor(channel) : null);
  const accessToken = connection?.access_token ?? (channel ? envTokenFor(channel) : null);

  if (!channel || !accountId || !accessToken) {
    await holdForHuman(`no send credentials for channel ${channel ?? "unknown"}`, { ...decision, reply: text }, sources);
    return;
  }

  const sent = await sendMessage(channel, accountId, conversation.external_customer_id, text, accessToken);

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    sender_type: "ai",
    body: text,
    external_message_id: sent.messageId ?? null,
    ai_confidence: decision.confidence,
    ai_sources: sources,
    status: sent.ok ? "sent" : "failed",
  });

  // A booked order is the human step: the owner confirms it from the inbox.
  const status = !sent.ok || bookedOrderId ? "needs_human" : "open";
  await supabase
    .from("conversations")
    .update({ status, last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
}
