#!/usr/bin/env node
/**
 * Post an HMAC-signed synthetic Meta webhook, exactly as Meta would.
 *
 * Useful for exercising the ingest path without a real DM — especially for
 * Messenger and WhatsApp, which need a Page / phone number before real
 * messages can arrive.
 *
 *   node scripts/simulate-dm.mjs instagram "do you deliver to pokhara?"
 *   node scripts/simulate-dm.mjs whatsapp "kati parcha?" --url https://myna-app.example.workers.dev
 *
 * Reads META_APP_SECRET (and the channel account ids) from .env.local.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      const value = rest.join("=").trim().replace(/^["']|["']$/g, "");
      if (value) env[key.trim()] ??= value;
    }
  } catch {
    // no .env.local — rely on the real environment
  }
  return env;
}

const env = loadEnv();
const args = process.argv.slice(2);
const channel = args[0] ?? "instagram";
const text = args[1] ?? "Hello! Is this still available?";
const urlFlag = args.indexOf("--url");
const senderFlag = args.indexOf("--from");
const base =
  urlFlag !== -1 ? args[urlFlag + 1] : env.MYNA_URL ?? "http://localhost:3000";
const sender = senderFlag !== -1 ? args[senderFlag + 1] : null;

const accounts = {
  instagram: env.IG_ACCOUNT_ID ?? "28482564724763771",
  messenger: env.FB_PAGE_ID ?? "101010101010101",
  whatsapp: env.WA_PHONE_NUMBER_ID ?? "202020202020202",
};

const senders = {
  instagram: sender ?? "9900112233445566",
  messenger: sender ?? "7788990011223344",
  whatsapp: sender ?? "9779800000000",
};

const mid = `sim-${channel}-${Date.now()}`;

function payloadFor(ch) {
  const accountId = accounts[ch];
  const from = senders[ch];

  if (ch === "whatsapp") {
    return {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_SIM",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "9779800000001", phone_number_id: accountId },
                contacts: [{ wa_id: from, profile: { name: "Sita (WhatsApp sim)" } }],
                messages: [
                  {
                    from,
                    id: mid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: text },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  // Instagram and Messenger share this envelope; only `object` differs.
  return {
    object: ch === "instagram" ? "instagram" : "page",
    entry: [
      {
        id: accountId,
        time: Date.now(),
        messaging: [
          {
            sender: { id: from },
            recipient: { id: accountId },
            timestamp: Date.now(),
            message: { mid, text },
          },
        ],
      },
    ],
  };
}

if (!accounts[channel]) {
  console.error(`Unknown channel "${channel}" — use instagram, messenger or whatsapp.`);
  process.exit(1);
}

const secret = env.META_APP_SECRET;
if (!secret) {
  console.error("META_APP_SECRET is not set — cannot sign the payload.");
  process.exit(1);
}

const body = JSON.stringify(payloadFor(channel));
const signature = `sha256=${createHmac("sha256", secret).update(body, "utf-8").digest("hex")}`;
const endpoint = `${base.replace(/\/$/, "")}/api/webhooks/meta`;

const started = Date.now();
const res = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature },
  body,
});

console.log(`${channel} → ${endpoint}`);
console.log(`  account ${accounts[channel]} · from ${senders[channel]} · mid ${mid}`);
console.log(`  ${res.status} ${res.statusText} in ${Date.now() - started}ms`);
console.log(`  ${(await res.text()).slice(0, 200)}`);
