#!/usr/bin/env node
/**
 * Every customer message must get a reply. This sends the messages that used
 * to get silence (discounts, complaints, "talk to a human", abuse, gibberish,
 * off-topic, a lone reel) from fake Instagram senders, all at once, and checks
 * each one got an outbound message in the database, and how fast.
 *
 *   node scripts/reply-guarantee-test.mjs                       # live Worker
 *   node scripts/reply-guarantee-test.mjs --url http://localhost:3000
 *   node scripts/reply-guarantee-test.mjs --cleanup             # delete the test chats
 *
 * Senders are 9900112233RG01…: not real Instagram ids, so Meta rejects the
 * sends and nobody is messaged (outbound rows are stored as `failed`, which
 * still proves Maya answered). Discount/complaint cases page the owner's
 * phone, since that is part of what is being tested.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
const args = process.argv.slice(2);
const base = (args.includes("--url") ? args[args.indexOf("--url") + 1] : "https://myna-app.aarohan567.workers.dev").replace(/\/$/, "");
const IG = env.IG_ACCOUNT_ID ?? "28482564724763771";
const PREFIX = "9900112233RG";
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
  console.log(`removed ${ids.length} reply-test conversations`);
  process.exit(0);
}

/** [label, first message, optional follow-up sent after the first reply] */
const CASES = [
  ["price list (romanised)", "kati parcha?"],
  ["discount (romanised)", "discount milcha?", "plz discount dinus na"],
  ["discount (English)", "can I get a discount if I buy 2?"],
  ["complaint", "my order arrived broken, I want a refund now"],
  ["asks for a person", "I want to talk to a real person please"],
  ["abuse", "you are useless, fuck off"],
  ["gibberish", "asdkjh qwe zzzx"],
  ["off-topic", "write me a python script to sort a list"],
  ["Devanagari", "मलाई सबैभन्दा राम्रो चस्मा कुन हो?"],
  ["chasing", "hello?? anyone there???"],
  ["lone reel", { attachment: "ig_reel" }],
];

function sign(body) {
  return `sha256=${createHmac("sha256", env.META_APP_SECRET).update(body, "utf-8").digest("hex")}`;
}

async function dm(sender, msg) {
  const message =
    typeof msg === "string"
      ? { mid: `rg-${sender}-${Date.now()}`, text: msg }
      : { mid: `rg-${sender}-${Date.now()}`, attachments: [{ type: msg.attachment, payload: { url: "https://example.com/reel" } }] };
  const body = JSON.stringify({
    object: "instagram",
    entry: [{ id: IG, time: Date.now(), messaging: [{ sender: { id: sender }, recipient: { id: IG }, timestamp: Date.now(), message }] }],
  });
  const res = await fetch(`${base}/api/webhooks/meta`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign(body) }, body });
  return res.status;
}

/** The outbound messages Maya sent after `after`, once any arrive (or null after the timeout). */
async function waitForReply(sender, after, timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const convs = await rest(`conversations?external_customer_id=eq.${sender}&select=id,status`);
    if (convs?.[0]) {
      const msgs = await rest(
        `messages?conversation_id=eq.${convs[0].id}&direction=eq.outbound&status=neq.draft_pending&created_at=gt.${new Date(after).toISOString()}&select=body,status,created_at&order=created_at.asc`,
      );
      if (msgs?.length) {
        await new Promise((r) => setTimeout(r, 2500)); // let photos + text all land
        const all = await rest(
          `messages?conversation_id=eq.${convs[0].id}&direction=eq.outbound&status=neq.draft_pending&created_at=gt.${new Date(after).toISOString()}&select=body,status,created_at&order=created_at.asc`,
        );
        return { ms: Date.parse(msgs[0].created_at) - after, msgs: all, status: convs[0].status };
      }
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return null;
}

const s = (ms) => `${(ms / 1000).toFixed(1)}s`;
const short = (t) => t.replace(/\s+/g, " ").slice(0, 110);
console.log(`${CASES.length} cases → ${base}\n`);

const results = await Promise.all(
  CASES.map(async ([label, first, follow], i) => {
    const sender = `${PREFIX}${String(i + 1).padStart(2, "0")}`;
    const t0 = Date.now();
    const http = await dm(sender, first);
    const r1 = await waitForReply(sender, t0 - 1500);
    let r2;
    if (follow && r1) {
      const t1 = Date.now();
      await dm(sender, follow);
      r2 = { sent: true, reply: await waitForReply(sender, t1 - 500, 30000) };
    }
    return { label, http, r1, follow, r2 };
  }),
);

let silent = 0;
for (const { label, http, r1, follow, r2 } of results) {
  if (!r1) silent++;
  console.log(`${r1 ? "✓" : "✗ SILENT"} ${label} (http ${http})${r1 ? ` · ${s(r1.ms)} · chat ${r1.status}` : ""}`);
  for (const m of r1?.msgs ?? []) console.log(`    → ${short(m.body)}`);
  if (follow) {
    console.log(`    follow-up "${follow}": ${r2?.reply ? `replied in ${s(r2.reply.ms)}: ${short(r2.reply.msgs[0].body)}` : "no second reply (expected: one holding line per few minutes)"}`);
  }
}
const times = results.filter((r) => r.r1).map((r) => r.r1.ms).sort((a, b) => a - b);
console.log(`\n${results.length - silent}/${results.length} answered · median ${s(times[Math.floor(times.length / 2)] ?? NaN)} · slowest ${s(times.at(-1) ?? NaN)}`);
console.log(`Clean up: node scripts/reply-guarantee-test.mjs --cleanup`);
process.exit(silent ? 1 : 0);
