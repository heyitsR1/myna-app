#!/usr/bin/env node
/**
 * Rehearse the demo conversation against the deployed Worker without a
 * phone: posts HMAC-signed Instagram events from a fake customer, waits for
 * Maya's reply after each turn, prints the transcript. The Graph send fails
 * (the customer does not exist) but the reply text and the booked order are
 * real. Clean up afterwards with `node scripts/purge-sim-data.mjs --apply`.
 *
 *   node scripts/play-demo.mjs
 *   node scripts/play-demo.mjs "hello" "price please" "I'll take the wayfarer"
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
const base = env.MYNA_URL ?? "https://myna-app.aarohan567.workers.dev";
const sender = env.SIM_SENDER ?? "9900112233445566";
const account = env.IG_ACCOUNT_ID ?? "28482564724763771";
const turns = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["hello", "price please", "I'll take the wayfarer, 1 piece. Aarohan, Jhamsikhel Lalitpur, 9841000000"];

const sb = (path) =>
  fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  }).then((r) => r.json());

async function conversationId() {
  const rows = await sb(`conversations?external_customer_id=eq.${sender}&select=id,status`);
  return rows[0] ?? null;
}

async function send(text) {
  const mid = `sim-instagram-${Date.now()}`;
  const body = JSON.stringify({
    object: "instagram",
    entry: [{ id: account, time: Date.now(), messaging: [{ sender: { id: sender }, recipient: { id: account }, timestamp: Date.now(), message: { mid, text } }] }],
  });
  const sig = "sha256=" + createHmac("sha256", env.META_APP_SECRET).update(body, "utf-8").digest("hex");
  const res = await fetch(`${base}/api/webhooks/meta`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body });
  if (res.status !== 200) throw new Error(`webhook ${res.status}: ${await res.text()}`);
  return mid;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const text of turns) {
  const before = await conversationId();
  const seen = before ? (await sb(`messages?conversation_id=eq.${before.id}&select=id`)).length : 0;
  const t0 = Date.now();
  await send(text);
  console.log(`\n👤  ${text}`);
  let reply = null;
  while (Date.now() - t0 < 60000) {
    await sleep(2000);
    const conv = await conversationId();
    if (!conv) continue;
    const msgs = await sb(`messages?conversation_id=eq.${conv.id}&select=direction,body,status,ai_confidence,triage&order=created_at.asc`);
    const fresh = msgs.slice(seen).filter((m) => m.direction === "outbound");
    if (fresh.length) {
      reply = fresh[fresh.length - 1];
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const tag = reply.status === "draft_pending" ? "HELD FOR YOU" : reply.status === "failed" ? "auto (send failed: fake customer)" : "auto-sent";
      // Jev's read of the customer's message, written by lib/reply.ts before
      // Maya drafted anything. Undefined when TypeSafe was unreachable and the
      // pipeline fell back to the keyword guards.
      const t = [...msgs].reverse().find((m) => m.direction === "inbound" && m.triage)?.triage;
      if (t) {
        console.log(
          `🧭  ${t.intent}@${Number(t.intentConfidence ?? 0).toFixed(2)}` +
            `  frustration ${Number(t.frustration ?? 0).toFixed(2)}/2` +
            `  warmth ${Number(t.warmth ?? 0).toFixed(2)}/2` +
            `  owner-should-answer ${Math.round(Number(t.needsHuman ?? 0) * 100)}%` +
            `  [${t.model} · ${t.tokens}tok · ${t.latencyMs}ms]`,
        );
      }
      console.log(`🪶  [${tag} · ${Math.round((reply.ai_confidence ?? 0) * 100)}% · ${secs}s · thread ${conv.status}]\n${reply.body.split("\n").map((l) => "    " + l).join("\n")}`);
      break;
    }
  }
  if (!reply) console.log("⏳  no reply within 60s — check `npx wrangler tail myna-app`");
}

const conv = await conversationId();
if (conv) {
  const orders = await sb(`orders?conversation_id=eq.${conv.id}&select=order_number,status,items,total,delivery_address,phone`);
  if (orders.length) console.log("\n🧾  orders:", JSON.stringify(orders, null, 1));
}
