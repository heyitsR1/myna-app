#!/usr/bin/env node
/**
 * Summit load test: N fake strangers DM the shop at the same moment.
 *
 * Each fake customer gets a persona (browser, buyer, haggler, troll,
 * complainer, spammer…) and sends its lines as signed Instagram webhooks,
 * all senders in parallel. Then it reads Supabase until every thread has
 * been handled and checks the outcome per persona, not just "a reply came":
 *
 *   - webhook status + latency (Meta retries anything slow or non-200)
 *   - time from the customer's last message to Maya's reply / hold
 *   - at most one pending draft per thread
 *   - haggler → held, draft is the fixed holding line, no auto-reply
 *   - troll → held, no draft, no auto-reply
 *   - buyer → exactly one order
 *   - spammer (3 messages in 1s) → one answer, not three
 *
 *   node scripts/burst-test.mjs --url https://myna-staging.<sub>.workers.dev -n 25
 *   node scripts/burst-test.mjs --cleanup          # delete burst threads
 *
 * Senders are 990077xxxxxxxxx ids and mids are `sim-burst-*`, so
 * purge-sim-data.mjs and --cleanup both find them. Graph sends to these
 * fake ids fail; that is expected and counts as "replied" (status failed).
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const env = { ...process.env };
for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const [k, ...rest] = t.split("=");
  const v = rest.join("=").trim().replace(/^["']|["']$/g, "");
  if (v) env[k.trim()] ??= v;
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const base = flag("--url", env.MYNA_URL ?? "http://localhost:3000").replace(/\/$/, "");
const n = Number(flag("-n", "25"));
const timeoutMs = Number(flag("--timeout", "120")) * 1000;
const SENDER_PREFIX = "990077";

const sbUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = env.SUPABASE_SERVICE_ROLE_KEY;
async function rest(path, init = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${sbUrl}/rest/v1/${path}`, {
        ...init,
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          ...init.headers,
        },
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      return res.status === 204 ? [] : res.json();
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function burstConversations() {
  return rest(
    `conversations?external_customer_id=like.${SENDER_PREFIX}*&select=id,external_customer_id,status`,
  );
}

if (args.includes("--cleanup")) {
  const convs = await burstConversations();
  for (const c of convs) await rest(`conversations?id=eq.${c.id}`, { method: "DELETE" });
  console.log(`deleted ${convs.length} burst conversation(s) (messages + orders cascade)`);
  process.exit(0);
}

// ── Personas ──────────────────────────────────────────────────────────────
// `gapMs` is the pause between a persona's own lines. Real people wait for a
// reply; the spammer deliberately does not.
const HOLDING_NEGOTIATION = "Let me check with the owner about the price";
const PERSONAS = [
  { kind: "browser", lines: ["price please"], expect: "auto" },
  { kind: "browser", lines: ["kati parcha?"], expect: "auto" },
  { kind: "question", lines: ["do you deliver to pokhara?"], expect: "auto" },
  { kind: "buyer", lines: ["I'll take the MS-03 wayfarer, deliver to Baneshwor, 9841000000"], expect: "order" },
  { kind: "haggler", lines: ["Discount?"], expect: "negotiation" },
  { kind: "haggler", lines: ["can you give me last price for 2 aviators"], expect: "negotiation" },
  { kind: "troll", lines: ["you guys are fucking scammers"], expect: "abuse" },
  { kind: "troll", lines: ["muji"], expect: "abuse" },
  { kind: "complainer", lines: ["my sunglasses arrived broken, I want a refund"], expect: "hold" },
  { kind: "spammer", lines: ["hi", "hello", "what do you sell?"], gapMs: 300, expect: "one-answer" },
];

const secret = env.META_APP_SECRET;
const account = env.IG_ACCOUNT_ID ?? "28482564724763771";
const runId = Date.now().toString().slice(-6);

async function post(senderId, text, i) {
  const mid = `sim-burst-${runId}-${senderId}-${i}`;
  const body = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: account,
        time: Date.now(),
        messaging: [
          { sender: { id: senderId }, recipient: { id: account }, timestamp: Date.now(), message: { mid, text } },
        ],
      },
    ],
  });
  const sig = `sha256=${createHmac("sha256", secret).update(body, "utf-8").digest("hex")}`;
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/api/webhooks/meta`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig },
      body,
    });
    const text = await res.text();
    return { status: res.status, ms: Date.now() - t0, error: res.ok ? undefined : text.slice(0, 120) };
  } catch (err) {
    return { status: 0, ms: Date.now() - t0, error: String(err) };
  }
}

const customers = Array.from({ length: n }, (_, i) => ({
  senderId: `${SENDER_PREFIX}${runId}${String(i).padStart(4, "0")}`,
  persona: PERSONAS[i % PERSONAS.length],
  webhooks: [],
}));

console.log(`burst: ${n} customers → ${base}  (run ${runId})`);
const tStart = Date.now();
await Promise.all(
  customers.map(async (c) => {
    for (const [i, line] of c.persona.lines.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, c.persona.gapMs ?? 0));
      c.webhooks.push(await post(c.senderId, line, i));
    }
    c.lastSentAt = Date.now();
  }),
);
const hooks = customers.flatMap((c) => c.webhooks);
console.log(
  `webhooks: ${hooks.length} sent in ${Date.now() - tStart}ms · ` +
    `non-200: ${hooks.filter((h) => h.status !== 200).length} · ` +
    `p50 ${pct(hooks.map((h) => h.ms), 50)}ms p95 ${pct(hooks.map((h) => h.ms), 95)}ms max ${Math.max(...hooks.map((h) => h.ms))}ms`,
);

const failures = hooks.filter((h) => h.status !== 200);
if (failures.length) {
  const byStatus = {};
  for (const f of failures) (byStatus[`${f.status} ${f.error ?? ""}`.trim()] ??= []).push(f.ms);
  for (const [k, v] of Object.entries(byStatus)) console.log(`  ${v.length}× ${k.replace(/\s+/g, " ")}`);
}

// ── Wait for every thread to be handled ──────────────────────────────────
function pct(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN;
}

const bySender = new Map(customers.map((c) => [c.senderId, c]));
const deadline = Date.now() + timeoutMs;
let snapshot = [];
while (Date.now() < deadline) {
  const convs = await rest(
    `conversations?external_customer_id=like.${SENDER_PREFIX}${runId}*` +
      `&select=id,external_customer_id,status,messages(direction,status,body,created_at,triage),orders(id,status)`,
  );
  snapshot = convs;
  for (const conv of convs) {
    const c = bySender.get(conv.external_customer_id);
    if (!c || c.doneAt) continue;
    const inbound = conv.messages.filter((m) => m.direction === "inbound");
    const handled =
      inbound.length === c.persona.lines.length &&
      (conv.messages.some((m) => m.direction === "outbound") || conv.status === "needs_human");
    if (handled) c.doneAt = Date.now();
  }
  const pending = customers.filter((c) => !c.doneAt).length;
  if (pending === 0) break;
  await new Promise((r) => setTimeout(r, 1500));
}
await new Promise((r) => setTimeout(r, 8000)); // let late duplicates show up
snapshot = await rest(
  `conversations?external_customer_id=like.${SENDER_PREFIX}${runId}*` +
    `&select=id,external_customer_id,status,messages(direction,status,body,created_at,triage),orders(id,status)`,
);

// ── Judge ────────────────────────────────────────────────────────────────
const problems = [];
const latencies = [];
for (const c of customers) {
  const conv = snapshot.find((x) => x.external_customer_id === c.senderId);
  const label = `${c.persona.kind} ${c.senderId.slice(-4)}`;
  if (!conv) {
    problems.push(`${label}: no conversation stored`);
    continue;
  }
  if (!c.doneAt) problems.push(`${label}: not handled within ${timeoutMs / 1000}s`);
  else latencies.push(c.doneAt - c.lastSentAt);

  const out = conv.messages.filter((m) => m.direction === "outbound");
  const auto = out.filter((m) => m.status !== "draft_pending");
  const drafts = out.filter((m) => m.status === "draft_pending");
  if (drafts.length > 1) problems.push(`${label}: ${drafts.length} pending drafts`);

  switch (c.persona.expect) {
    case "auto":
      if (auto.length !== 1) problems.push(`${label}: expected 1 auto reply, got ${auto.length} (${drafts.length} draft)`);
      break;
    case "order":
      if (conv.orders.length !== 1) problems.push(`${label}: expected 1 order, got ${conv.orders.length}`);
      break;
    case "negotiation":
      if (auto.length) problems.push(`${label}: haggler got an auto reply: "${auto[0].body.slice(0, 60)}"`);
      if (!drafts[0]?.body.includes(HOLDING_NEGOTIATION))
        problems.push(`${label}: draft is not the holding line: "${drafts[0]?.body.slice(0, 60) ?? "(none)"}"`);
      break;
    case "abuse":
      if (out.length) problems.push(`${label}: troll got ${auto.length} reply / ${drafts.length} draft`);
      if (conv.status !== "needs_human") problems.push(`${label}: troll not flagged for owner`);
      break;
    case "hold":
      if (auto.length) problems.push(`${label}: complaint got an auto reply`);
      break;
    case "one-answer":
      if (auto.length !== 1) problems.push(`${label}: spammer got ${auto.length} auto replies (want 1)`);
      break;
  }
}

console.log(
  `handled: ${latencies.length}/${n} · reply after last message ` +
    `p50 ${pct(latencies, 50)}ms p95 ${pct(latencies, 95)}ms max ${latencies.length ? Math.max(...latencies) : NaN}ms`,
);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ✗ ${p}`);
} else {
  console.log("all persona checks passed ✓");
}
console.log(`\nclean up: node scripts/burst-test.mjs --cleanup`);
process.exit(problems.length ? 1 : 0);
