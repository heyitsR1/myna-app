import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { envAccountFor, envTokenFor, instagramToken } from "@/lib/meta";
import { activeProvider, embed, providerModels } from "@/lib/llm";
import { triageMessage } from "@/lib/triage";
import type { Channel } from "@/lib/types";

export const runtime = "nodejs";

/**
 * One URL to hit before a demo. Every dependency Myna needs to answer a DM is
 * probed live — not "is the key set" but "does the key still work" — and each
 * failure names the fix. Sits behind the Basic-auth gate like the rest of the
 * app; `scripts/demo-up.sh` calls it with credentials.
 *
 *   GET /api/health          → JSON
 *   GET /api/health?text=1   → one line per check, for the shell
 */

interface Check {
  ok: boolean;
  /** What was found. */
  detail: string;
  /** What to do when `ok` is false. */
  fix?: string;
}

const TIMEOUT_MS = 8000;

async function fetchJson(url: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function checkSupabase(): Promise<Check> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, detail: "keys missing", fix: "set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY" };
  const { error } = await supabase.from("brands").select("id").limit(1);
  return error
    ? { ok: false, detail: error.message, fix: "check Supabase project status / service-role key" }
    : { ok: true, detail: "reachable" };
}

async function checkLlm(): Promise<Check> {
  const provider = await activeProvider();
  const models = providerModels(provider);

  if (provider === "cloudflare") {
    const t0 = Date.now();
    try {
      const [vec] = await embed(["health check"]);
      return {
        ok: vec.length === 1024,
        detail: `Workers AI · ${models.chat} + ${models.embed} · embed ${vec.length}-dim in ${Date.now() - t0}ms`,
        fix: "embedding dim must be 1024 — check CF_EMBED_MODEL",
      };
    } catch (err) {
      return { ok: false, detail: `Workers AI failed: ${errorText(err)}`, fix: "is the `ai` binding in wrangler.jsonc deployed? or `npx wrangler secret put LLM_PROVIDER` → ollama" };
    }
  }

  const base = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  const host = (() => {
    try {
      return new URL(base).host;
    } catch {
      return base;
    }
  })();
  try {
    const { status, body } = await fetchJson(`${base}/api/tags`, {
      headers: { "ngrok-skip-browser-warning": "1" },
    });
    if (status !== 200) {
      return { ok: false, detail: `ollama ${host} answered ${status}`, fix: "run scripts/demo-up.sh (restarts ngrok and re-points the Worker), or switch: bash scripts/llm-switch.sh cloudflare" };
    }
    const names = ((body as { models?: Array<{ name?: string }> })?.models ?? []).map((m) => m.name ?? "");
    const has = (model: string) => names.some((n) => n === model || n.startsWith(`${model}:`) || n === `${model}:latest`);
    const missing = [models.chat, models.embed].filter((m) => !has(m));
    if (missing.length) {
      return { ok: false, detail: `ollama ${host} up, models missing: ${missing.join(", ")}`, fix: `ollama pull ${missing.join(" && ollama pull ")}` };
    }
    return { ok: true, detail: `ollama via ${host} · ${models.chat} + ${models.embed} present` };
  } catch (err) {
    return {
      ok: false,
      detail: `ollama ${host} unreachable (${errorText(err)})`,
      fix: "Mac asleep or ngrok restarted — run scripts/demo-up.sh, or switch: bash scripts/llm-switch.sh cloudflare",
    };
  }
}

/**
 * Not "is the key set" but "does Jev still answer, and does it still answer
 * this correctly". A plain delivery question must come back as `question` —
 * if that flips, the criteria or the model version moved and the routing
 * thresholds in lib/triage.ts need revisiting before a demo, not during one.
 */
const TRIAGE_CANARY = "do you deliver to Pokhara? how many days";

async function checkTypeSafe(): Promise<Check> {
  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    return {
      ok: false,
      detail: "no key — triage off, Maya falls back to the keyword guards",
      fix: "set TYPESAFE_API_KEY locally, or `npx wrangler secret put TYPESAFE_API_KEY` for the Worker",
    };
  }
  const t0 = Date.now();
  const t = await triageMessage({
    brandName: "health check",
    message: TRIAGE_CANARY,
    history: [],
    pendingOrderSkus: [],
    catalogueJustShown: false,
  });
  if (!t) {
    return {
      ok: false,
      detail: "key present but the call failed",
      fix: "check the key is valid and api.typesafe.ai is reachable — the APIError is in the server logs",
    };
  }
  return {
    ok: t.intent === "question" && t.intentConfidence >= 0.5,
    detail: `${t.model} · canary → ${t.intent} @${t.intentConfidence.toFixed(2)} · ${t.tokens} tok in ${Date.now() - t0}ms`,
    fix: `expected "question" with confidence ≥ 0.5 on a plain delivery question — criteria or model version drifted`,
  };
}

async function checkInstagram(): Promise<Check> {
  const { token, source, expiresAt } = await instagramToken();
  if (!token) return { ok: false, detail: "no token", fix: "set IG_ACCESS_TOKEN" };

  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const me = await fetchJson("https://graph.instagram.com/v23.0/me?fields=id,username", auth);
  const meBody = me.body as { username?: string; error?: { message?: string } } | null;
  if (me.status !== 200 || !meBody?.username) {
    return {
      ok: false,
      detail: `token rejected: ${meBody?.error?.message ?? me.status}`,
      fix: "Instagram token expired — mint a new one in the Meta console (Instagram → API setup) and set IG_ACCESS_TOKEN",
    };
  }

  const subs = await fetchJson("https://graph.instagram.com/v23.0/me/subscribed_apps", auth);
  const subscribed = ((subs.body as { data?: Array<{ subscribed_fields?: string[] }> })?.data ?? []).some((a) =>
    a.subscribed_fields?.includes("messages"),
  );
  const expiry = expiresAt ? `expires ${expiresAt.slice(0, 10)}` : "expiry not tracked (run refresh)";
  if (!subscribed) {
    return {
      ok: false,
      detail: `@${meBody.username} token ok (${source}, ${expiry}) but account NOT subscribed to messages`,
      fix: "POST https://graph.instagram.com/v23.0/me/subscribed_apps?subscribed_fields=messages with the IG token",
    };
  }
  return { ok: true, detail: `@${meBody.username} · token ${source}, ${expiry} · subscribed to messages` };
}

async function checkWhatsApp(): Promise<Check> {
  const token = envTokenFor("whatsapp");
  const phoneId = envAccountFor("whatsapp");
  if (!token || !phoneId) return { ok: false, detail: "not configured", fix: "set WA_ACCESS_TOKEN + WA_PHONE_NUMBER_ID" };
  const res = await fetchJson(`https://graph.facebook.com/v23.0/${phoneId}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = res.body as { display_phone_number?: string; verified_name?: string; error?: { message?: string } } | null;
  if (res.status !== 200 || !body?.display_phone_number) {
    return {
      ok: false,
      detail: `token rejected: ${body?.error?.message ?? res.status}`,
      fix: "WhatsApp token expired — mint a System User token (permanent) and `npx wrangler secret put WA_ACCESS_TOKEN`",
    };
  }
  return { ok: true, detail: `${body.display_phone_number} (${body.verified_name ?? "unnamed"}) · token ok` };
}

/**
 * When did Meta last actually deliver something, per channel? A healthy
 * token and a verified callback URL prove nothing if Meta has stopped
 * calling — this is the number that catches a webhook silently unsubscribed.
 */
async function lastInbound(): Promise<Record<Channel, string | null>> {
  const out: Record<Channel, string | null> = { instagram: null, whatsapp: null, messenger: null };
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  const { data } = await supabase
    .from("messages")
    .select("created_at, conversation:conversations(connection:channel_connections(channel))")
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(200);
  for (const row of (data ?? []) as unknown as Array<{ created_at: string; conversation?: { connection?: { channel?: string } } | null }>) {
    const ch = row.conversation?.connection?.channel as Channel | undefined;
    if (ch && !out[ch]) out[ch] = row.created_at;
  }
  return out;
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export async function GET(request: Request) {
  const [supabase, llm, triage, instagram, whatsapp, inbound] = await Promise.all([
    checkSupabase(),
    checkLlm(),
    checkTypeSafe(),
    checkInstagram(),
    checkWhatsApp(),
    lastInbound(),
  ]);

  const checks = { supabase, llm, triage, instagram, whatsapp };
  const webhook: Check = {
    ok: true,
    detail: `last inbound — instagram ${ago(inbound.instagram)}, whatsapp ${ago(inbound.whatsapp)}, messenger ${ago(inbound.messenger)}`,
    fix: "if a real DM is missing here, Meta is not delivering: check the callback URL + subscribed fields in the Meta console (Webhooks), not the app",
  };
  const ok = Object.values(checks).every((c) => c.ok);
  const payload = { ok, checkedAt: new Date().toISOString(), checks: { ...checks, webhook } };

  if (new URL(request.url).searchParams.get("text")) {
    const lines = Object.entries(payload.checks).map(([name, c]) => {
      const mark = c.ok ? "✓" : "✗";
      return `${mark} ${name.padEnd(10)} ${c.detail}${c.ok ? "" : `\n    → ${c.fix}`}`;
    });
    lines.push(ok ? "READY" : "NOT READY — fix the ✗ lines above");
    return new Response(lines.join("\n") + "\n", { status: ok ? 200 : 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.json(payload, { status: ok ? 200 : 503 });
}
