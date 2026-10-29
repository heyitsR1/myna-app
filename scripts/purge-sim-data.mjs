#!/usr/bin/env node
/**
 * Remove data created by `scripts/simulate-dm.mjs` — synthetic messages
 * (`sim-*` external ids), and the placeholder channel connections the
 * simulator invents when a real Page / phone number does not exist yet.
 *
 * Dry-run by default. Pass --apply to actually delete.
 *
 *   node scripts/purge-sim-data.mjs
 *   node scripts/purge-sim-data.mjs --apply
 */
import { readFileSync } from "node:fs";

const env = { ...process.env };
for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const [k, ...rest] = t.split("=");
  const v = rest.join("=").trim().replace(/^["']|["']$/g, "");
  if (v) env[k.trim()] ??= v;
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Supabase keys missing from .env.local");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
// Placeholder account ids from simulate-dm.mjs's fallbacks.
const FAKE_ACCOUNTS = ["101010101010101", "202020202020202"];

async function rest(path, init = {}, attempt = 1) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
// Wi-Fi/DNS blips ("getaddrinfo ENOTFOUND") — retry a couple of times.
const restRaw = rest;
async function restRetry(path, init = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await restRaw(path, init, attempt);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr;
}

const simMessages = await restRetry("messages?external_message_id=like.sim-*&select=id,body");
const fakeConns = await rest(
  `channel_connections?external_account_id=in.(${FAKE_ACCOUNTS.join(",")})&select=id,channel,external_account_id`,
);

console.log(`${simMessages.length} synthetic message(s):`);
for (const m of simMessages) console.log(`   ${m.body.slice(0, 60)}`);
console.log(`${fakeConns.length} placeholder connection(s):`);
for (const c of fakeConns) console.log(`   ${c.channel} ${c.external_account_id}`);

if (!apply) {
  console.log("\nDry run. Re-run with --apply to delete.");
  process.exit(0);
}

for (const m of simMessages) await rest(`messages?id=eq.${m.id}`, { method: "DELETE" });
// The rehearsal customer (scripts/play-demo.mjs) — orders + messages cascade.
await rest("conversations?external_customer_id=eq.9900112233445566", { method: "DELETE" });
// Conversations and messages cascade from the connection.
for (const c of fakeConns) await rest(`channel_connections?id=eq.${c.id}`, { method: "DELETE" });
console.log("\nDeleted.");
