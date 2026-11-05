#!/usr/bin/env node
/**
 * Pre-demo checklist. Run on demo morning, and again 10 minutes before
 * going on stage. Exits non-zero if anything would embarrass us.
 *
 *   MYNA_AUTH=myna:<password> node scripts/predemo-check.mjs
 *   MYNA_AUTH=myna:<password> node scripts/predemo-check.mjs --roundtrip
 *   node scripts/predemo-check.mjs --url https://myna-staging.aarohan567.workers.dev
 *
 * Checks, in order:
 *   1. /api/health is READY (Supabase, Workers AI, triage, IG token +
 *      subscription, WhatsApp) and the deployed build has the summit fixes
 *      (/api/wall exists).
 *   2. Supabase answers directly (it pauses after ~7 idle days on free tier).
 *   3. Instagram token has 14+ days left.
 *   4. Test data is gone: no simulator / burst threads, no placeholder
 *      connections, no stale threads from before today, at most one pending
 *      draft per thread.
 *   5. --roundtrip: a signed fake DM ("kati parcha?") goes through the real
 *      pipeline and gets the catalogue back, then the thread is deleted.
 *      The Graph send to the fake id fails; that is expected.
 *
 * MYNA_AUTH defaults to BASIC_AUTH_USER/BASIC_AUTH_PASSWORD from the
 * environment. The live password is a Worker secret, not in .env.local.
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
const urlFlag = args.indexOf("--url");
const base = (urlFlag !== -1 ? args[urlFlag + 1] : env.MYNA_URL ?? "https://myna-app.aarohan567.workers.dev").replace(/\/$/, "");
const auth =
  env.MYNA_AUTH ?? (env.BASIC_AUTH_USER && env.BASIC_AUTH_PASSWORD ? `${env.BASIC_AUTH_USER}:${env.BASIC_AUTH_PASSWORD}` : null);
const authHeader = auth ? { Authorization: `Basic ${Buffer.from(auth).toString("base64")}` } : {};

const sbUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = env.SUPABASE_SERVICE_ROLE_KEY;

let failures = 0;
let warnings = 0;
const ok = (msg) => console.log(`✓ ${msg}`);
const fail = (msg, fix) => {
  failures++;
  console.log(`✗ ${msg}${fix ? `\n    → ${fix}` : ""}`);
};
const warn = (msg, fix) => {
  warnings++;
  console.log(`! ${msg}${fix ? `\n    → ${fix}` : ""}`);
};

async function rest(path, init = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
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
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      return res.status === 204 ? [] : res.json();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500 * attempt)); // Wi-Fi / DNS blips
    }
  }
  throw lastErr;
}

console.log(`Pre-demo check → ${base}\n`);

// ── 1. Health + build ─────────────────────────────────────────────────────
if (!auth) {
  fail("no Basic-auth credentials", "MYNA_AUTH=myna:<password> node scripts/predemo-check.mjs");
} else {
  try {
    const res = await fetch(`${base}/api/health`, { headers: authHeader, signal: AbortSignal.timeout(45_000) });
    if (res.status === 401) {
      fail("health: 401, wrong Basic-auth password", "check MYNA_AUTH against the BASIC_AUTH_PASSWORD Worker secret");
    } else {
      const health = await res.json();
      for (const [name, c] of Object.entries(health.checks ?? {})) {
        if (c.ok) ok(`${name.padEnd(9)} ${c.detail}`);
        else fail(`${name.padEnd(9)} ${c.detail}`, c.fix);
      }
      if (!health.ok) fail("health is NOT READY");
    }
  } catch (err) {
    fail(`health unreachable: ${err.message}`, "is the Worker deployed? is Supabase paused?");
  }

  const wall = await fetch(`${base}/api/wall`, { headers: authHeader }).catch(() => null);
  if (wall?.ok) ok("build      has the summit fixes (/api/wall answers)");
  else fail(`build      /api/wall → ${wall?.status ?? "no answer"}`, "the deployed Worker is the old build. Deploy the ws-c/live-ready merge");
}

// ── 2. Supabase directly ─────────────────────────────────────────────────
try {
  await rest("brands?select=id&limit=1");
  ok("supabase   answers directly");
} catch (err) {
  fail(`supabase   ${err.message}`, "project paused? Restore it from the Supabase dashboard (free tier pauses after ~7 idle days)");
}

// ── 3. Instagram token ───────────────────────────────────────────────────
try {
  const conns = await rest(
    "channel_connections?select=channel,external_account_id,token_expires_at,conversations(last_message_at)",
  );
  const ig = conns.filter((c) => c.channel === "instagram");
  const expiry = ig.map((c) => c.token_expires_at).filter(Boolean).sort().pop();
  if (!expiry) warn("ig token   no expiry stored on the connection row", "health's instagram line is the source of truth");
  else {
    const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86_400_000);
    if (days < 14) fail(`ig token   expires in ${days} days`, `POST ${base}/api/maintenance/refresh-ig-token`);
    else ok(`ig token   ${days} days left (${expiry.slice(0, 10)})`);
  }
  const fake = conns.filter((c) => ["101010101010101", "202020202020202"].includes(c.external_account_id));
  if (fake.length) fail(`${fake.length} placeholder channel connection(s)`, "node scripts/purge-sim-data.mjs --apply");
  // Meta has switched which id it puts in webhook `recipient.id` before
  // (28482… app-scoped in Aug, 17841… IG user id since 2 Nov). Real threads
  // hang off whichever one Meta uses now, so never prune by rule.
  if (ig.length > 1) {
    const desc = ig
      .map((c) => {
        const last = c.conversations.map((x) => x.last_message_at).filter(Boolean).sort().pop();
        return `${c.external_account_id} (${c.conversations.length} threads${last ? `, last ${last.slice(0, 16)}` : ""})`;
      })
      .join(" · ");
    warn(`${ig.length} instagram connection rows: ${desc}`, "harmless; do NOT prune the one real DMs land on");
  }
} catch (err) {
  fail(`connections ${err.message}`);
}

// ── 4. Test data ─────────────────────────────────────────────────────────
try {
  const convs = await rest(
    "conversations?select=id,customer_name,external_customer_id,created_at,last_message_at,messages(status,external_message_id),orders(order_number,status)",
  );
  const sim = convs.filter(
    (c) =>
      c.external_customer_id.startsWith("990077") ||
      c.external_customer_id === "9900112233445566" ||
      c.messages.some((m) => m.external_message_id?.startsWith("sim-")),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const stale = convs.filter((c) => !sim.includes(c) && new Date(c.last_message_at ?? c.created_at) < today);
  const dupes = convs.filter((c) => c.messages.filter((m) => m.status === "draft_pending").length > 1);
  const orders = convs.flatMap((c) => c.orders);

  if (sim.length) fail(`${sim.length} simulator / burst thread(s) in the inbox`, "node scripts/burst-test.mjs --cleanup && node scripts/purge-sim-data.mjs --apply");
  else ok("test data  no simulator or burst threads");
  if (stale.length) {
    warn(
      `${stale.length} thread(s) from before today: ${stale.map((c) => c.customer_name ?? c.external_customer_id.slice(-4)).join(", ")}`,
      "if these are rehearsal threads: node scripts/reset-demo.mjs --apply (wipes ALL threads + orders)",
    );
  }
  if (dupes.length) fail(`${dupes.length} thread(s) with more than one pending draft`, "migration 006_one_pending_draft.sql not applied?");
  ok(`inbox      ${convs.length} thread(s), ${orders.length} order(s)`);

  // Store checkout orders have no conversation, so reset-demo's cascade
  // misses them (column from monso-store's 005_store.sql).
  const web = await rest("orders?source=eq.website&select=order_number").catch(() => null);
  if (web?.length) {
    warn(
      `${web.length} website order(s) in the back office: #${web.map((o) => o.order_number).join(", #")}`,
      "if they are test orders: DELETE them (reset-demo.mjs does not, they have no conversation)",
    );
  }
} catch (err) {
  fail(`test data  ${err.message}`);
}

// ── 5. Round trip ────────────────────────────────────────────────────────
if (args.includes("--roundtrip")) {
  const sender = `990077${Date.now().toString().slice(-9)}`;
  const account = env.IG_ACCOUNT_ID ?? "28482564724763771";
  const body = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: account,
        time: Date.now(),
        messaging: [
          {
            sender: { id: sender },
            recipient: { id: account },
            timestamp: Date.now(),
            message: { mid: `sim-predemo-${sender}`, text: "kati parcha?" },
          },
        ],
      },
    ],
  });
  const sig = `sha256=${createHmac("sha256", env.META_APP_SECRET).update(body, "utf-8").digest("hex")}`;
  const t0 = Date.now();
  const res = await fetch(`${base}/api/webhooks/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig },
    body,
  }).catch((err) => ({ ok: false, status: err.message }));
  if (!res.ok) {
    fail(`roundtrip  webhook → ${res.status}`);
  } else {
    let reply = null;
    let convId = null;
    while (Date.now() - t0 < 45_000 && !reply) {
      await new Promise((r) => setTimeout(r, 1500));
      const [conv] = await rest(
        `conversations?external_customer_id=eq.${sender}&select=id,messages(direction,status,body)`,
      );
      convId = conv?.id ?? null;
      reply = conv?.messages.find((m) => m.direction === "outbound") ?? null;
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (!reply) fail(`roundtrip  no reply within 45s`, "npx wrangler tail myna-app --format pretty");
    else if (!/MS-0\d/.test(reply.body)) fail(`roundtrip  reply in ${secs}s but no catalogue: "${reply.body.slice(0, 80)}"`);
    else ok(`roundtrip  "kati parcha?" → catalogue in ${secs}s (${reply.status}; failed send to a fake id is expected)`);
    if (convId) await rest(`conversations?id=eq.${convId}`, { method: "DELETE" });
  }
}

console.log(
  `\n${failures ? `NOT READY: ${failures} problem(s)` : "READY"}${warnings ? `, ${warnings} warning(s)` : ""}`,
);
process.exit(failures ? 1 : 0);
