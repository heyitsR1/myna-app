#!/usr/bin/env node
/**
 * Turn the default brand into "Monso Eyewear" for the demo: 5 sunglasses
 * SKUs in `products`, brand name + tone, and the brand guide uploaded via the
 * deployed app so it is chunked and embedded through the real pipeline.
 *
 *   node scripts/seed-monso-eyewear.mjs [--url https://…workers.dev]
 *
 * Reads Supabase keys from .env.local; BASIC_AUTH_PASSWORD from env (required).
 * Idempotent — re-run any time.
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
const args = process.argv.slice(2);
const appUrl = args[args.indexOf("--url") + 1] && args.includes("--url")
  ? args[args.indexOf("--url") + 1]
  : "https://myna-app.aarohan567.workers.dev";
const auth = "Basic " + Buffer.from(`myna:${env.BASIC_AUTH_PASSWORD ?? (() => { throw new Error("export BASIC_AUTH_PASSWORD first (see the private secrets bundle)"); })()}`).toString("base64");

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const [brand] = await rest("brands?select=id,name&order=created_at.asc&limit=1");
if (!brand) throw new Error("no brand row yet — upload any doc or receive one DM first");

await rest(`brands?id=eq.${brand.id}`, {
  method: "PATCH",
  body: JSON.stringify({
    name: "Monso Eyewear",
    tone_notes: "Warm, friendly, short. Greet with Namaste. Mix Nepali and English naturally. Sunglasses shop — a little playful, never salesy.",
  }),
});
console.log(`✓ brand → Monso Eyewear (${brand.id})`);

const products = [
  ["MS-01", "Classic Aviator", "gold metal frame, green lens, UV400", 2400],
  ["MS-02", "Retro Round", "tortoise-shell acetate frame, brown lens, UV400", 1950],
  ["MS-03", "Wayfarer Matte Black", "polarised, the everyday bestseller", 2800],
  ["MS-04", "Cat-Eye Rose", "rose-gold frame, pink gradient lens, for women", 2200],
  ["MS-05", "Sport Wrap", "polarised, lightweight, for riding and trekking", 3500],
].map(([sku, name, description, price], i) => ({ brand_id: brand.id, sku, name, description, price, in_stock: true, sort_order: i + 1 }));
await rest("products?on_conflict=brand_id,sku", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify(products),
});
console.log(`✓ ${products.length} products upserted`);

// Replace the brand guide: old docs (and their chunks, via cascade) go away.
const oldDocs = await rest("documents?select=id,filename");
for (const d of oldDocs) {
  await rest(`documents?id=eq.${d.id}`, { method: "DELETE" });
  console.log(`  removed old doc ${d.filename}`);
}
const form = new FormData();
form.append("file", new File([readFileSync("scripts/demo/monso-eyewear-guide.md")], "monso-eyewear-guide.md", { type: "text/markdown" }));
const up = await fetch(`${appUrl}/api/documents/upload`, { method: "POST", headers: { Authorization: auth }, body: form });
const upBody = await up.json();
if (!up.ok) throw new Error(`upload failed: ${JSON.stringify(upBody)}`);
console.log(`✓ uploaded monso-eyewear-guide.md (${upBody.document.id}) — indexing in background`);
