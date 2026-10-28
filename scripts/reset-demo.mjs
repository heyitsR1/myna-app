#!/usr/bin/env node
/**
 * Wipe every conversation, message and order so the demo can be replayed
 * from a clean inbox. Products, the brand doc and channel connections stay.
 *
 *   node scripts/reset-demo.mjs          # dry run — shows what would go
 *   node scripts/reset-demo.mjs --apply
 *
 * Instagram keeps its own copy of the thread; that is fine — Maya's memory
 * is this database, so the next DM starts fresh.
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

async function rest(path, init = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${url}/rest/v1/${path}`, {
        ...init,
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      return res.status === 204 ? [] : res.json();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500 * attempt)); // DNS/Wi-Fi blips
    }
  }
  throw lastErr;
}

const convos = await rest("conversations?select=id,customer_name,external_customer_id,messages(id),orders(order_number)");
console.log(`${convos.length} conversation(s):`);
for (const c of convos) {
  console.log(
    `   ${c.customer_name ?? "Customer ·" + c.external_customer_id.slice(-4)} · ${c.messages.length} messages · orders ${c.orders.map((o) => "#" + o.order_number).join(", ") || "none"}`,
  );
}
if (!process.argv.includes("--apply")) {
  console.log("\nDry run. Re-run with --apply to wipe them.");
  process.exit(0);
}
for (const c of convos) await rest(`conversations?id=eq.${c.id}`, { method: "DELETE" }); // messages + orders cascade
console.log("\nInbox is empty. Send a DM from the tester to start again.");
