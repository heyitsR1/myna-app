#!/usr/bin/env node
/**
 * Switch Myna's WhatsApp channel from Meta's test number to a real number.
 *
 *   node scripts/wa-go-live.mjs                                # list numbers on the current WABA
 *   node scripts/wa-go-live.mjs --waba <id>                    # list numbers on another WABA
 *   node scripts/wa-go-live.mjs <phone-number-id> --waba <id>  # register + switch Myna to it
 *
 * The real number lives on a NEW WhatsApp Business Account: the old
 * "Test WhatsApp Business Account" is capped at its one test number. The
 * system user behind WA_ACCESS_TOKEN must be assigned the new WABA first
 * (Business settings → Users → System users → myna-whatsapp → Assign assets
 * → WhatsApp accounts → full control).
 *
 * Switching does four things:
 *   1. POST /{id}/register with a 6-digit PIN so the Cloud API can use the
 *      number. The PIN becomes its two-step verification PIN and is saved to
 *      ~/mentorship/.secrets/wa-pin.txt.
 *   2. Subscribes the app to the new WABA's webhooks.
 *   3. Points the `channel_connections` whatsapp row at the new number ID.
 *   4. Replaces WA_PHONE_NUMBER_ID and WA_BUSINESS_ACCOUNT_ID in .env.local
 *      and in the live Worker's secrets.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
const G = "https://graph.facebook.com/v23.0";
const tok = env.WA_ACCESS_TOKEN;
const args = process.argv.slice(2);
const waba = args.includes("--waba") ? args[args.indexOf("--waba") + 1] : env.WA_BUSINESS_ACCOUNT_ID;
const id = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--waba");

async function graph(path, method = "GET", body) {
  const res = await fetch(`${G}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  return res.json();
}

const fields = "display_phone_number,verified_name,name_status,code_verification_status,status,quality_rating,platform_type";
const list = await graph(`${waba}/phone_numbers?fields=${fields}`);
if (list.error) throw new Error(`${waba}: ${list.error.message} (is this WABA assigned to the system user?)`);
console.log(`Numbers on WhatsApp Business Account ${waba}:`);
for (const n of list.data) {
  console.log(`  ${n.id}  ${n.display_phone_number}  "${n.verified_name}"  status=${n.status}  code=${n.code_verification_status}  name=${n.name_status}  platform=${n.platform_type}`);
}
if (!id) process.exit(0);

const target = list.data.find((n) => n.id === id);
if (!target) throw new Error(`${id} is not on WABA ${waba}`);
if (/test number/i.test(target.verified_name)) throw new Error("that is the test number");

// 1. Register for the Cloud API
const dir = `${process.env.HOME}/mentorship/.secrets`;
if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
const pinFile = `${dir}/wa-pin.txt`;
const pin = existsSync(pinFile) ? readFileSync(pinFile, "utf8").trim() : String(randomInt(100000, 999999));
writeFileSync(pinFile, pin, { mode: 0o600 });
const reg = await graph(`${id}/register`, "POST", { messaging_product: "whatsapp", pin });
if (reg.error) {
  console.error("register failed:", reg.error.message, reg.error.error_data?.details ?? "");
  console.error("If it says the number isn't verified, finish the code step in the app dashboard first.");
  process.exit(1);
}
console.log("✓ registered for the Cloud API (PIN saved to .secrets/wa-pin.txt)");

// 2. Webhooks for this WABA
const sub = await graph(`${waba}/subscribed_apps`, "POST");
if (sub.error) throw new Error(`subscribe failed: ${sub.error.message}`);
console.log(`✓ app subscribed to WABA ${waba}`);

// 3. Database
const sb = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
const up = await fetch(`${sb}/rest/v1/channel_connections?channel=eq.whatsapp`, {
  method: "PATCH",
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
  body: JSON.stringify({ external_account_id: id }),
});
console.log(`✓ channel_connections whatsapp → ${id} (${(await up.json()).length} row)`);

// 4. .env.local and Worker secrets
const set = { WA_PHONE_NUMBER_ID: id, WA_BUSINESS_ACCOUNT_ID: waba };
const kept = readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l && !Object.keys(set).some((k) => l.startsWith(`${k}=`)));
writeFileSync(".env.local", [...kept, ...Object.entries(set).map(([k, v]) => `${k}=${v}`), ""].join("\n"), { mode: 0o600 });
for (const [k, v] of Object.entries(set)) {
  execFileSync("npx", ["wrangler", "secret", "put", k], { input: v, stdio: ["pipe", "inherit", "inherit"] });
}
console.log("✓ WA_PHONE_NUMBER_ID and WA_BUSINESS_ACCOUNT_ID updated locally and on the Worker");
console.log(`\nNow WhatsApp ${target.display_phone_number} with "kati parcha?" from any phone and watch /inbox.`);
