#!/usr/bin/env node
/**
 * The summit stage script, end to end through the signed webhook: first
 * message gets the "what I can do" line (and only the first), offers are
 * quoted, an order gets the /o/<token> link, "10% discount … 2 ta lincha" is
 * held, abuse is hidden on the wall, Devanagari is answered in Devanagari.
 *
 *   node scripts/maya-demo-test.mjs                       # live Worker
 *   node scripts/maya-demo-test.mjs --url http://localhost:3100
 *   node scripts/maya-demo-test.mjs --only order          # one case
 *   node scripts/maya-demo-test.mjs --cleanup             # delete these chats + orders
 *
 * Senders are 9900112233MD…: not real Instagram ids, so Meta rejects every
 * send and nobody is messaged (outbound rows are stored as `failed`).
 * The order and discount cases page the owner's phone, as on stage.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
const args = process.argv.slice(2);
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const base = (flag("--url") ?? "https://myna-app.aarohan567.workers.dev").replace(/\/$/, "");
const IG = env.IG_ACCOUNT_ID ?? "28482564724763771";
const PREFIX = "9900112233MD";
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
  console.log(`removed ${ids.length} demo-test conversations`);
  process.exit(0);
}

const sign = (body) => `sha256=${createHmac("sha256", env.META_APP_SECRET).update(body, "utf-8").digest("hex")}`;

async function dm(sender, text) {
  const body = JSON.stringify({
    object: "instagram",
    entry: [{ id: IG, time: Date.now(), messaging: [{ sender: { id: sender }, recipient: { id: IG }, timestamp: Date.now(), message: { mid: `sim-md-${sender}-${Date.now()}`, text } }] }],
  });
  const res = await fetch(`${base}/api/webhooks/meta`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign(body) }, body });
  return res.status;
}

async function waitForReply(sender, after, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const convs = await rest(`conversations?external_customer_id=eq.${sender}&select=id,status`);
    if (convs?.[0]) {
      const q = `messages?conversation_id=eq.${convs[0].id}&direction=eq.outbound&status=neq.draft_pending&created_at=gt.${new Date(after).toISOString()}&select=body,status,created_at&order=created_at.asc`;
      const msgs = await rest(q);
      if (msgs?.length) {
        await new Promise((r) => setTimeout(r, 3000)); // photos, text and an Autopilot confirm can follow
        const [conv] = await rest(`conversations?id=eq.${convs[0].id}&select=id,status`);
        return { conv, msgs: await rest(q), ms: Date.parse(msgs[0].created_at) - after };
      }
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return null;
}

const MENU = /(collection|photo|offer|book|order|dekha|herna|अफर|अर्डर|फोटो|संग्रह)/i;
const HOLDING = /(owner|साहुजी).*(reply|जवाफ|garnuhunchha)|Let's keep it friendly|Ramrari kura|राम्रोसँग कुरा/i;
const LINK = /https?:\/\/\S+\/o\/([A-Za-z0-9_-]{24,})/;

/** [key, sender suffix, messages, check(replies) → problems[]] */
const CASES = [
  ["first-en", "01", ["Hi! do you have polarised sunglasses?", "is it unisex?"], (r) => [
    !MENU.test(r[0].text) && "first reply has no what-I-can-do line",
    r[1] && /this week's offers|book an order for you|show you the collection/i.test(r[1].text) && "menu repeated on the second message",
  ]],
  ["first-rom", "02", ["namaste, bike chalauna kun ramro?"], (r) => [!MENU.test(r[0].text) && "first reply has no what-I-can-do line"]],
  ["offers", "03", ["any offers this week?"], (r) => [
    !/free/i.test(r[0].text) && "offers not quoted",
    /\d+\s*%/.test(r[0].text) && "a percentage appeared",
    HOLDING.test(r[0].text) && "offers question was held",
  ]],
  ["order", "04", ["MS-03 chahiyo, Koteshwor, 9800000004"], (r) => [
    !LINK.test(r[0].text) && "no order link",
    !/Order #\d+/.test(r[0].text) && "no order summary",
  ]],
  ["discount", "05", ["10% discount milcha? 2 ta lincha"], (r) => [
    !HOLDING.test(r[0].text) && "discount NOT held",
    /\d+\s*%/.test(r[0].text) && "a percentage appeared",
    r[0].status !== "needs_human" && `chat status ${r[0].status}, expected needs_human`,
  ]],
  ["abuse", "06", ["you muji, fuck off"], (r) => [!/friendly|Ramrari|राम्रोसँग/i.test(r[0].text) && "abuse got no calm line"]],
  ["devanagari", "07", ["नमस्ते, चस्मा कति पर्छ?"], (r) => [!/[ऀ-ॿ]/.test(r[0].text) && "no Devanagari in the reply"]],
];

const only = flag("--only");
const run = CASES.filter(([k]) => !only || k === only);
console.log(`${run.length} cases → ${base}\n`);

const results = await Promise.all(
  run.map(async ([key, suffix, messages, check]) => {
    const sender = `${PREFIX}${suffix}`;
    const replies = [];
    for (const m of messages) {
      const t = Date.now();
      const http = await dm(sender, m);
      const r = await waitForReply(sender, t - 1500);
      replies.push(r ? { http, ms: r.ms, status: r.conv.status, text: r.msgs.map((x) => x.body).join("\n  ¦ "), convId: r.conv.id } : null);
      if (!r) break;
    }
    const problems = replies[0] ? check(replies).filter(Boolean) : ["NO REPLY"];
    return { key, sender, messages, replies, problems };
  }),
);

let failed = 0;
for (const { key, messages, replies, problems } of results) {
  if (problems.length) failed++;
  console.log(`${problems.length ? "✗" : "✓"} ${key}${problems.length ? `  ← ${problems.join("; ")}` : ""}`);
  messages.forEach((m, i) => {
    const r = replies[i];
    console.log(`   customer: ${m}`);
    console.log(`   maya (${r ? `${(r.ms / 1000).toFixed(1)}s, chat ${r.status}` : "none"}): ${r?.text.replace(/\n/g, "\n             ") ?? "—"}`);
  });
  const link = replies[0]?.text.match(LINK);
  if (link) console.log(`   link: ${link[0]}`);
  console.log("");
}

// What the projector would show for these chats.
const wall = await fetch(`${base}/api/wall`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
if (wall?.cards) {
  const ids = new Set(results.flatMap((r) => r.replies.filter(Boolean).map((x) => x.convId)));
  for (const c of wall.cards.filter((c) => ids.has(c.id))) {
    console.log(`wall · ${c.name.padEnd(10)} ${c.state.padEnd(8)} text=${JSON.stringify(c.customerText)} reply=${JSON.stringify((c.reply ?? c.holdLabel ?? "").slice(0, 80))}`);
  }
} else {
  console.log("wall: not readable from here (gated); check /wall by eye");
}
console.log(`\n${run.length - failed}/${run.length} passed. Clean up: node scripts/maya-demo-test.mjs --cleanup`);
process.exit(failed ? 1 : 0);
