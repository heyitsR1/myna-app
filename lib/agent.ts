/**
 * Maya's brain on Claude: a short tool-use loop instead of one JSON verdict.
 *
 * The model talks freely and decides *what to do*; our code does it. Tools
 * are the only way Maya changes anything: she can't book an order, send a
 * photo or hand a thread to the owner by saying so, only by calling the
 * tool, and every tool re-checks its inputs against the catalogue. Prices,
 * totals and order numbers come back from the tools, never from the model.
 *
 * Hard rules that must not depend on a model (abuse gets silence, discounts
 * and complaints go to the owner) run before this in reply.ts.
 *
 * Model: MAYA_MODEL (default claude-haiku-5-5), called with fetch so the
 * Worker needs no SDK. Swap models without a deploy:
 *   npx wrangler secret put MAYA_MODEL   # e.g. claude-sonnet-5-5
 */
import type { RetrievedChunk } from "@/lib/rag";
import { catalogueForPrompt, formatNpr, matchProduct } from "@/lib/orders";
import type { Product } from "@/lib/types";

const API = "https://api.anthropic.com/v1/messages";
const MAX_TURNS = 5;

export function claudeEnabled(): boolean {
  const brain = process.env.MAYA_BRAIN?.trim().toLowerCase();
  return Boolean(process.env.ANTHROPIC_API_KEY) && brain !== "llama";
}

export function claudeModel(): string {
  return process.env.MAYA_MODEL?.trim() || "claude-haiku-5-5";
}

export interface BookingResult {
  ok: boolean;
  /** What the customer is shown, built by our code: order number, item, total. */
  summary?: string;
  missing?: string[];
  error?: string;
}

export interface AgentTools {
  products: Product[];
  /** Create or update this conversation's pending order. */
  book: (args: {
    sku: string;
    quantity: number;
    customer_name: string;
    delivery_address: string;
    phone: string;
  }) => Promise<BookingResult>;
}

export interface AgentResult {
  /** Final message to the customer (empty when the model only handed off). */
  text: string;
  /** Products whose photos go out before the text, in order. */
  photos: Product[];
  /** The full price list goes out after the text. */
  showList: boolean;
  /** Set when book_order succeeded; the summary is appended to the text. */
  booking: BookingResult | null;
  /** Set when Maya decided the owner should answer. */
  handoff: string | null;
  turns: number;
  model: string;
}

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "thinking" | "redacted_thinking"; [k: string]: unknown };

interface ApiMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

const TOOLS = [
  {
    name: "show_price_list",
    description:
      "Send the full price list (every product with code and price). Use when the customer asks what you sell, for prices in general, the collection, or wants to order but hasn't picked anything. Your text reply is sent first, then the list, so write only a short intro.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "send_product_photos",
    description:
      "Send real photos of specific products. Use whenever the customer wants to see something (photo, pic, dekhaunu, 'how does it look'), or when you recommend 1-3 products. Max 3 per message.",
    input_schema: {
      type: "object",
      properties: {
        skus: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3, description: "Product codes, e.g. MS-03" },
      },
      required: ["skus"],
      additionalProperties: false,
    },
  },
  {
    name: "book_order",
    description:
      "Book (or update) the customer's order. ONLY when the customer has clearly chosen a specific product AND said they want it (e.g. 'MS-03 chahiyo', 'I'll take the wayfarer', '2 of number 4'). Never for questions, browsing, or 'can I see'. Calling it again for the same product updates quantity/address/phone. Pass any name, delivery address and phone they have given in the conversation (empty string if not).",
    input_schema: {
      type: "object",
      properties: {
        sku: { type: "string" },
        quantity: { type: "integer", minimum: 1, maximum: 20 },
        customer_name: { type: "string" },
        delivery_address: { type: "string" },
        phone: { type: "string" },
      },
      required: ["sku", "quantity", "customer_name", "delivery_address", "phone"],
      additionalProperties: false,
    },
  },
  {
    name: "handoff_to_owner",
    description:
      "Pass the conversation to the shop owner. Use for anything you can't or shouldn't decide: discounts or price changes, refunds, returns, damaged items, wholesale/bulk prices, custom requests, an upset customer, or a question your context doesn't answer. Your text reply becomes a draft the owner checks before it is sent, so write a short holding line.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string", description: "One short sentence for the owner." } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

function systemPrompt(brandName: string, toneNotes: string | null, chunks: RetrievedChunk[], products: Product[], pending: string): string {
  const context = chunks.length
    ? chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n")
    : "(nothing in the shop guide matched this message)";
  return `You are Maya, the shop assistant for ${brandName}, a small sunglasses shop in Nepal. You chat with customers on Instagram, WhatsApp and Messenger for the owner.

How you talk:
- Like a friendly Kathmandu shopkeeper texting a customer: warm, quick, natural. Short messages (1-3 sentences, under 50 words). No bullet lists in your own words, no corporate tone.
- Mirror the customer's language and script exactly: English → English; romanised Nepali ("kati parcha?") → romanised Nepali written only in Latin letters (never mix in Devanagari or Hindi words); Devanagari → Devanagari; mixed → mixed.
- Answer every question in their message, not just the first.
- Actually help them choose: ask what it's for (riding, trekking, everyday, gift), suggest the best 1-2 pairs with a reason, and show photos. Be a good salesperson, never pushy.
- Stay on the shop. If someone asks for something unrelated (homework, code, general chat), politely bring it back to sunglasses.

Facts:
- Only use the catalogue and the shop guide below. Never invent prices, stock, discounts, delivery times or policies. If it isn't there, say you'll check with the owner and call handoff_to_owner.
- You never give discounts or negotiate. Price questions get the listed price; discount requests go to the owner.

Doing things (use tools, don't just say it):
- Showing products: show_price_list for the whole range, send_product_photos to show specific ones.
- Booking: book_order only when they clearly pick a product and want it. After booking, the order summary is added automatically below your text, so write one warm line and, if address or phone is missing, ask for it naturally.
- Owner: handoff_to_owner for discounts, complaints, refunds, bulk, custom requests or anything you're unsure about.
${toneNotes ? `\nOwner's tone notes:\n${toneNotes}\n` : ""}
Catalogue (exact NPR prices):
${catalogueForPrompt(products)}

This customer's open order: ${pending}

Shop guide (most relevant parts):
${context}`;
}

async function callClaude(system: string, messages: ApiMessage[]): Promise<{ content: Block[]; stop_reason: string }> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: claudeModel(),
      max_tokens: 1024,
      output_config: { effort: process.env.MAYA_EFFORT?.trim() || "low" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  return (await res.json()) as { content: Block[]; stop_reason: string };
}

/** Claude wants strictly alternating turns that start with the customer. */
function toApiMessages(history: Array<{ role: "user" | "assistant"; content: string }>): ApiMessage[] {
  const out: ApiMessage[] = [];
  for (const m of history) {
    if (!m.content.trim()) continue;
    if (out.length === 0 && m.role === "assistant") continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n${m.content}`;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

export async function runMaya(input: {
  brandName: string;
  toneNotes: string | null;
  chunks: RetrievedChunk[];
  history: Array<{ role: "user" | "assistant"; content: string }>;
  pendingOrder: string;
  tools: AgentTools;
}): Promise<AgentResult> {
  const { products } = input.tools;
  const system = systemPrompt(input.brandName, input.toneNotes, input.chunks, products, input.pendingOrder);
  const messages = toApiMessages(input.history);
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    throw new Error("conversation does not end with a customer message");
  }

  const result: AgentResult = { text: "", photos: [], showList: false, booking: null, handoff: null, turns: 0, model: claudeModel() };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    result.turns = turn + 1;
    const res = await callClaude(system, messages);
    const text = res.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) result.text = text;

    const calls = res.content.filter(
      (b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use",
    );
    if (res.stop_reason !== "tool_use" || calls.length === 0) break;

    messages.push({ role: "assistant", content: res.content as Array<Record<string, unknown>> });
    const results: Array<Record<string, unknown>> = [];
    for (const call of calls) {
      let out: string;
      if (call.name === "show_price_list") {
        result.showList = true;
        out = "The full price list will be sent right after your message. Write only a short friendly intro line.";
      } else if (call.name === "send_product_photos") {
        const skus = Array.isArray(call.input.skus) ? (call.input.skus as unknown[]).map(String) : [];
        const found = skus.map((s) => matchProduct(products, s)).filter((p): p is Product => Boolean(p));
        for (const p of found) if (!result.photos.some((x) => x.sku === p.sku)) result.photos.push(p);
        result.photos = result.photos.slice(0, 3);
        out = found.length
          ? `Photos queued for: ${found.map((p) => `${p.sku} ${p.name} (${formatNpr(Number(p.price))})`).join(", ")}. They are sent before your text, so refer to them naturally.`
          : `No product matched ${skus.join(", ")}. Valid codes: ${products.map((p) => p.sku).join(", ")}.`;
      } else if (call.name === "book_order") {
        const booking = await input.tools.book({
          sku: String(call.input.sku ?? ""),
          quantity: Math.max(1, Number(call.input.quantity) || 1),
          customer_name: String(call.input.customer_name ?? ""),
          delivery_address: String(call.input.delivery_address ?? ""),
          phone: String(call.input.phone ?? ""),
        });
        if (booking.ok) result.booking = booking;
        out = booking.ok
          ? `Booked. This summary is shown to the customer under your text:\n${booking.summary}\n${
              booking.missing?.length ? `Still missing: ${booking.missing.join(" and ")} — ask for it.` : "Nothing missing."
            } Write one short warm line; do not repeat the summary.`
          : `Booking failed: ${booking.error}. Tell the customer kindly, or hand off to the owner.`;
      } else if (call.name === "handoff_to_owner") {
        result.handoff = String(call.input.reason ?? "Maya handed off");
        out = "The owner has been notified. Write a short, warm holding line for the customer (it is reviewed first).";
      } else {
        out = `Unknown tool ${call.name}.`;
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }

  return result;
}
