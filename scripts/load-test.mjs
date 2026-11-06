#!/usr/bin/env node
/**
 * Summit rush rehearsal: N fake customers DM the live webhook at the same
 * moment, then each sends a follow-up once Maya answers. Measures how long
 * every customer waits for a reply.
 *
 *   node scripts/load-test.mjs              # 20 customers against MYNA_URL
 *   node scripts/load-test.mjs 30 --url https://myna-app.aarohan567.workers.dev
 *   node scripts/load-test.mjs --cleanup    # delete every load-test conversation
 *
 * Senders are fake Instagram ids (9900112233LT0001…): Meta rejects the
 * outbound send, so no real person is ever messaged, but the whole pipeline
 * (webhook → triage → Claude tool loop → send attempt → DB) runs for real.
 * Messages avoid orders and discounts so the owner's phone isn't paged.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
const args = process.argv.slice(2);
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 20);
const base = (args.includes("--url") ? args[args.indexOf("--url") + 1] : "https://myna-app.aarohan567.workers.dev").replace(/\/$/, "");
const IG = env.IG_ACCOUNT_ID ?? "28482564724763771";
const PREFIX = "9900112233LT";
const sb = env.NEXT_PUBLIC_SUPABASE_URL;
const sbHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

async function rest(path, init = {}) {
  const res = await fetch(`${sb}/rest/v1/${path}`, { ...init, headers: { ...sbHeaders, ...init.headers } });
  return res.status === 204 ? null : res.json();
}

if (args.includes("--cleanup")) {
  const convs = await rest(`conversations?external_customer_id=like.${PREFIX}*&select=id`);
  const ids = convs.map((c) => c.id);
  if (ids.length) {
    const list = `(${ids.join(",")})`;
    await rest(`orders?conversation_id=in.${list}`, { method: "DELETE" });
    await rest(`messages?conversation_id=in.${list}`, { method: "DELETE" });
    await rest(`conversations?id=in.${list}`, { method: "DELETE" });
  }
  console.log(`removed ${ids.length} load-test conversations`);
  process.exit(0);
}

const FIRST = [
  "kati parcha sunglasses?", "Hi! What sunglasses do you have?", "price list pathaunu na",
  "do you deliver to pokhara?", "which one is good for bike riding?", "polarised wala cha?",
  "cash on delivery huncha?", "can I see photos of the round ones?", "gift ko lagi kun ramro?",
  "how long does delivery take inside ktm?", "MS-03 ko photo pathaidinu", "are these UV400?",
  "namaste, sunglasses herna paryo", "what's your bestseller?", "trekking ko lagi kun?",
  "do you have anything for small faces?", "return policy k ho?", "hello", "aviator cha?",
  "which ones are under 2500?",
];
const SECOND = ["ok thanks, and colours?", "dhanyabad! aru photo cha?", "nice, is it unisex?", "ok will think about it 🙏"];

function sign(body) {
  return `sha256=${createHmac("sha256", env.META_APP_SECRET).update(body, "utf-8").digest("hex")}`;
}

async function dm(sender, text) {
  const body = JSON.stringify({
    object: "instagram",
    entry: [{ id: IG, time: Date.now(), messaging: [{ sender: { id: sender }, recipient: { id: IG }, timestamp: Date.now(), message: { mid: `lt-${sender}-${Date.now()}`, text } }] }],
  });
  const t = Date.now();
  const res = await fetch(`${base}/api/webhooks/meta`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign(body) }, body });
  return { status: res.status, ms: Date.now() - t };
}

/**
 * Wait until Maya has sent this customer something after their latest
 * message. A chat flagged for the owner with nothing sent is not an answer:
 * counting it as one is how silent holds hid in earlier load tests.
 */
async function waitForReply(sender, after, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const convs = await rest(`conversations?external_customer_id=eq.${sender}&select=id,status`);
    if (convs?.[0]) {
      const msgs = await rest(
        `messages?conversation_id=eq.${convs[0].id}&direction=eq.outbound&created_at=gt.${new Date(after).toISOString()}&select=body,status,sender_type,created_at&order=created_at.asc`,
      );
      const sent = (msgs ?? []).filter((m) => m.status !== "draft_pending");
      if (sent.length) return { ms: Date.parse(sent[0].created_at) - after, msgs: sent, conv: convs[0] };
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return null;
}

const pct = (xs, p) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : NaN);
const s = (ms) => `${(ms / 1000).toFixed(1)}s`;

console.log(`${N} customers → ${base} (all at once)\n`);
const customers = Array.from({ length: N }, (_, i) => ({ sender: `${PREFIX}${String(i + 1).padStart(4, "0")}`, first: FIRST[i % FIRST.length], second: SECOND[i % SECOND.length] }));

const t0 = Date.now();
const results = await Promise.all(
  customers.map(async (c) => {
    const sent1 = Date.now();
    const hook1 = await dm(c.sender, c.first);
    const r1 = await waitForReply(c.sender, sent1 - 1500);
    let r2 = null, hook2 = null;
    if (r1) {
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 3000)); // a human reading the reply
      const sent2 = Date.now();
      hook2 = await dm(c.sender, c.second);
      r2 = await waitForReply(c.sender, sent2 - 1500);
    }
    const line = r1 ? s(r1.ms) : "NO REPLY";
    console.log(`  ${c.sender.slice(-4)}  "${c.first}" → ${line}${r2 ? ` · follow-up ${s(r2.ms)}` : hook2 ? " · follow-up NO REPLY" : ""}`);
    return { c, hook1, hook2, r1, r2 };
  }),
);

const hooks = results.flatMap((r) => [r.hook1, r.hook2].filter(Boolean));
const firsts = results.map((r) => r.r1?.ms).filter((x) => x != null).sort((a, b) => a - b);
const seconds = results.map((r) => r.r2?.ms).filter((x) => x != null).sort((a, b) => a - b);
const failedSends = results.flatMap((r) => [...(r.r1?.msgs ?? []), ...(r.r2?.msgs ?? [])]).length;
console.log(`
webhook acks: ${hooks.filter((h) => h.status === 200).length}/${hooks.length} OK, slowest ${Math.max(...hooks.map((h) => h.ms))}ms
first replies: ${firsts.length}/${N} · median ${s(pct(firsts, 50))} · p90 ${s(pct(firsts, 90))} · slowest ${s(firsts.at(-1) ?? 0)}
follow-ups:    ${seconds.length}/${results.filter((r) => r.hook2).length} · median ${s(pct(seconds, 50))} · slowest ${s(seconds.at(-1) ?? 0)}
outbound rows logged: ${failedSends} (fake ids, so Meta refuses delivery: expected "failed")
total wall time: ${s(Date.now() - t0)}
`);
