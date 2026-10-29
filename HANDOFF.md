# Myna — session handoff

Paste-able context for a fresh Claude Code chat. Repo: `~/mentorship/myna-app`.

## What this is
**Myna** — unified inbox (Instagram/WhatsApp/Facebook DMs) + AI agent **Maya** that auto-replies to customers from an uploaded brand document. For Nepali SMBs; competitor sambad.io. Mentorship project.

## Locked decisions — do not re-litigate
- Brand (from `~/mentorship/gate2/brand/`): ink `#0B1F3A`, brass `#C9A24B`, clay `#C56A3E`, marigold `#E9A23B`, paper `#FBF8F1`, bone `#F4EFE6`. Fonts: **SF system stack** for UI/body, **Fraunces** display serif, **JetBrains Mono** labels. Tokens live in `app/globals.css`.
- **Local AI via Ollama** (no hosted APIs): `qwen3:8b` chat + `mxbai-embed-large` embeddings (1024-dim), through the provider abstraction in `lib/llm.ts`.
- Design reference: preview artifact <https://claude.ai/code/artifact/1f540de4-39b3-4745-9532-420a62d4c396> (update it via the `url` param, don't create a new one). App UI must match it.

## Current state (Aug 25, 2026 — see Aug 30 update below)
- Next.js 16 App Router + Tailwind v4; `npm run build` passes. Screens: `/inbox` (3-pane, draft approval, Maya toggle), `/brain` (doc upload → chunk/embed/index), `/channels`.
- **Supabase live**: project `myna`, ref `idwvbhjklhgqjmclrifj`, account test.user.hithx@gmail.com, region ap-southeast-1. Migrations `001_init.sql` (pgvector schema + RLS + match_doc_chunks) and `002_storage.sql` (brand-docs bucket) applied. All keys + db password in `.env.local` (never commit). CLI is linked (`supabase db push` works).
- **Meta**: app "In_myna" (app id 1786651242584559), IG professional test account **@monso.hit** (BUSINESS). App ID/secret/tokens in `.env.local`. Dev-mode single-brand shortcut (`IG_ACCESS_TOKEN`/`IG_ACCOUNT_ID`), no OAuth flow yet.
  - `IG_ACCOUNT_ID` is **28482564724763771** — the app-scoped id `graph.instagram.com/me` returns, which is the namespace Meta puts in webhook `recipient.id`. (The earlier `17841436916236016` also resolves to the same account via Graph aliasing, but would not match the webhook lookup in `app/api/webhooks/meta/route.ts`.)
  - Token verified live against Graph; `/messages` POST reaches the send endpoint (fails only on unknown recipient, as expected until a real DM exists).
- **Ollama ready**: `qwen3:8b` + `mxbai-embed-large` both pulled; embeddings confirmed **1024 dims**, matching `vector(1024)`.
- **Pipeline verified end-to-end (Aug 25)** with an HMAC-signed synthetic webhook: valid sig → 200 in ~1.8s, tampered sig → 401; brand + connection auto-created; Maya ran on qwen3:8b and correctly held for human ("no delivery/shipping info in brand context", confidence 30%) → `draft_pending` + `needs_human`, rendering in `/inbox` with the approval UI. Only the real Graph send is still unexercised.
  - A synthetic test conversation (customer id `9900112233445566`) is sitting in the inbox — delete it whenever you want a clean slate.
- Pipeline wired end-to-end: webhook (HMAC-verified, `app/api/webhooks/meta/route.ts`) → store → RAG (`lib/rag.ts`) → Maya decision JSON (`lib/reply.ts`, auto-send ≥0.8 confidence else `draft_pending`+`needs_human`) → Graph API send (`lib/meta.ts`).
- Stubbed: WhatsApp/Messenger send paths, auth/multi-tenancy, OAuth connect, realtime (10s polling fallback until auth exists).

## Aug 30, 2026 update — deployed + multi-channel

**Deployed:** <https://myna-app.aarohan567.workers.dev> on Cloudflare Workers
via `@opennextjs/cloudflare` (`npm run deploy`). Required bumping Next to
16.3.3 — OpenNext's peer range is `>=15.5.24 <16 || >=16.3.3`, so 16.3.2 was
just below the line.

**Password gate:** `proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`;
it runs on the Node runtime, so `node:crypto` works there). HTTP Basic,
`myna` / `TqLr2f92kVwCS6EC`, stored as Worker secrets. Excluded from the gate:
`/api/webhooks/*` (Meta cannot authenticate; HMAC guards it instead),
`/privacy`, `/data-deletion`. Verified live: gated 401, correct creds 200,
webhook handshake 200 + challenge, unsigned POST 401.

**All three channels ingest into one inbox.** The webhook now normalises both
Meta envelope shapes into one `InboundMessage` record:
- `object: "instagram"` and `object: "page"` → `entry[].messaging[]`
- `object: "whatsapp_business_account"` → `entry[].changes[].value.messages[]`

`lib/meta.ts` gained `sendMessengerMessage` (graph.facebook.com
`/{page-id}/messages`), `sendWhatsAppMessage` (`messaging_product: "whatsapp"`,
`to`, `type: "text"`), a `sendMessage` dispatcher used by both `lib/reply.ts`
and the manual-send route, and `fetchCustomerName` so the inbox shows a person
not a 17-digit id. `envTokenFor`/`envAccountFor` keep the dev-mode single-brand
shortcut per channel.

**Verified on the deployed Worker** with `scripts/simulate-dm.mjs` (new — posts
HMAC-signed synthetic webhooks): all three channels returned 200 and appeared
in `/api/inbox` tagged `instagram` / `messenger` / `whatsapp`, with the
WhatsApp sender's profile name resolved. Maya then ran on qwen3:8b and held for
human ("No price info in context") — correct, since no brand doc is uploaded.
The synthetic `messenger` (`101010101010101`) and `whatsapp`
(`202020202020202`) connection rows are fake; delete them before demoing real
connections, or they show as CONNECTED in `/channels`.

**Ollama and the Worker.** A Worker cannot reach `localhost:11434`. Without a
tunnel the deployed app still ingests everything and marks conversations
"Needs you"; it just never drafts. Fix for demos:
`ngrok http 11434 --host-header=localhost:11434`, then
`echo "<url>" | npx wrangler secret put OLLAMA_BASE_URL`. The chat call took
~32s through the tunnel and completed fine inside `after()`. The URL changes
on every ngrok restart.

**Structure change:** app routes moved into a `(app)` route group with its own
layout holding the Rail; new `(legal)` group holds public `/privacy` and
`/data-deletion` pages (both are App Review requirements and must stay
unauthenticated).

**Still open:** Meta Business Verification and App Review are not started —
that is the only thing standing between the tester-only DM flow and a random
person getting an automated reply. Meta's webhook config stores one callback
URL per product, so the webhook currently points at either ngrok or the Worker,
not both.

## Sep 7, 2026 update — demo prep (demo Sep 8)

- **qwen3 thinking is now off** (`think: false`, `keep_alive: "60m"`, `num_predict: 350` in `lib/llm.ts`). With thinking on, the chat call took 32–38s through the tunnel and the Worker's `after()` budget (~30s) killed the pipeline *after* the model answered — no draft, no error, nothing in the DB. With it off the same call is ~10s and a signed test DM produced a 0.95-confidence answer from the brand doc in 14s end to end. Deployed.
- **Brand doc uploaded**: `monso-brand-guide.md` (3 chunks, status ready) for brand **Monso** (renamed from "My Shop", tone notes set). Source copy in the session scratchpad; re-create from `/brain` if lost.
- **DB cleaned**: all synthetic conversations and the two placeholder connections are gone. Remaining: the real WhatsApp thread from Aarohan (+977…8675, Aug 30) and the real Aug 25 Instagram thread (resolved).
- **WhatsApp token expired Aug 30** (24h API-Setup token). Stale in `.env.local` and the Worker secret; the `channel_connections` row's copy was nulled so env wins once refreshed. Ingest still works; only sending fails. Mint a new one (System User token is permanent), then `sed` it into `.env.local`, `npx wrangler secret put WA_ACCESS_TOKEN`, done — no rebuild needed.
- **`scripts/demo-up.sh`** — run before every demo: checks Ollama, starts ngrok if needed, pushes the current tunnel URL to the Worker secret, warms the model. Then `caffeinate -d`.
- `npx wrangler login` expires periodically; wrangler is not global, always `npx wrangler`.
- Instagram token expires ~Oct 24, 2026 (60-day, issued Aug 25).

## Immediate next steps

Phase now: **get the aggregator solid and demoable.** RAG quality, retrieval
tuning and brand voice come after — deliberately deferred.

1. **Connect a real Facebook Page** (SETUP.md §3b). Free, same app, same
   webhook, ~15 minutes. This is the highest-value next step: it turns the
   multi-channel story from simulated into real.
2. **Add the WhatsApp test number** (SETUP.md §3c). Also free. The temporary
   token expires in 24h — fine for a demo, needs a System User token after.
3. **Point Meta's webhook at the Worker**
   (`https://myna-app.aarohan567.workers.dev/api/webhooks/meta`) so the demo
   does not depend on a laptop tunnel for ingest.
4. **Delete the synthetic connection rows** before demoing, so `/channels`
   reflects reality.
5. **Business Verification + App Review** — start now, it is slow and it gates
   everything. See below.
6. *Then* the AI phase: upload a brand doc, tune `lib/reply.ts`, revisit the
   confidence threshold, consider a hosted model behind `lib/llm.ts`.

## Going public (App Review) — not started

Tester-only DMs are a Meta permission limit, not a bug. To let a random person
get an automated reply, `instagram_business_basic` and
`instagram_business_manage_messages` (plus `pages_messaging` for Messenger)
must pass App Review, which requires:

- A public privacy policy URL → `/privacy` (live, unauthenticated)
- A public data deletion URL → `/data-deletion` (live, unauthenticated)
- A stable HTTPS callback URL → the Worker (done)
- **Meta Business Verification** of the business portfolio → not started; this
  is the long pole, start it first
- A screencast and written use-case description per permission
- The app in Live mode (already is)

Also pending regardless of review: the Instagram long-lived token expires
after **60 days** and nothing refreshes it yet — Myna will go quiet without an
error when it lapses.

## Instagram delivery — solved Aug 25, in this order
Real DM → draft → approve → send is **fully working**. The blockers, in the order they bit us:
1. **App must be in Live mode.** Development mode silently delivers *zero* webhooks — no error, no request, nothing reaches the tunnel. Meta states this in the Configure Webhooks panel. This was the real blocker; everything else below was necessary but not sufficient.
2. **Account-level subscription** is separate from verifying the callback URL. Fix: `POST https://graph.instagram.com/v23.0/me/subscribed_apps?subscribed_fields=messages` with the IG token. Verify with the matching GET — `{"data":[]}` means unsubscribed.
3. **First DM from a new account lands in Requests**, not Primary, and requests do not fire webhooks until accepted.
4. Sender must have a role on the app (Instagram Tester) and must *accept* the invite from that account.
5. "Allow access to messages" / Connected tools exists only in the **mobile** IG app, not web — and did not appear at all for this account, so it was not required here.

`META_APP_SECRET` (`ace9dc6c…`) is **correct** — proven by a real Meta webhook verifying and returning 200. It does not pair with the Facebook app ID in an OAuth `client_credentials` check; that is expected for Instagram Login apps and is not a problem.

Diagnostic trick (updated Aug 30 — the app is on Cloudflare now, no tunnel): `npx wrangler tail myna-app --format pretty` shows every request that reached the app. If Meta isn't there at all, the problem is on Meta's side, not in the app — don't debug the code. The webhook logs `[webhook] accepted <object>` on success and, on a 401, names the object type that failed the signature check.

## Channel roadmap + costs (researched Aug 25, 2026 — verify before relying on pricing)
- **Facebook Messenger — free, do this next.** Same Meta app, same webhook URL; payloads arrive as `object: "page"` with the same `entry[].messaging[]` shape. Needs: a Facebook Page, Page access token, `pages_messaging` permission, and the Page subscribed to the app. Send path is `POST /{page-id}/messages` on `graph.facebook.com` — mirrors `lib/meta.ts`.
- **WhatsApp Cloud API — free for our use case.** Customer-initiated messages open a 24h service window; replies inside it are not charged. Only *business-initiated template* messages are billed per message, per country. Myna only auto-replies to inbound, so ~zero marginal cost. Real cost is setup friction: Meta Business verification, a dedicated phone number not registered on consumer WhatsApp, display-name approval.
- **TikTok — not possible.** No public API exposes TikTok DMs (Display API, Content Posting API and Business API all omit messaging). TikTok Shop seller messaging exists only in select markets, likely not Nepal. Scraping violates ToS. **Product implication:** TikTok cannot be in the unified inbox. Position as Instagram + Facebook + WhatsApp, keep TikTok manual, and don't promise it in demos.

## Gotchas learned
- Don't name CSS classes after Tailwind utilities (`h-screen` collision already bitten once — renamed to `page-title`).
- App must keep running keyless (graceful empty states) — preserve that when editing.
- Meta webhook must 200 fast; reply pipeline runs via `after()`.
- Next 16 renamed `middleware.ts` → `proxy.ts` (exported function named `proxy`). It defaults to the **Node.js** runtime, and setting `runtime` in it throws.
- OpenNext's Cloudflare adapter refuses Next 16.0–16.3.2. Peer range is `>=15.5.24 <16 || >=16.3.3`.
- OpenNext warns that Node.js middleware on Cloudflare is experimental — the Basic auth proxy works, but re-test it after any OpenNext upgrade.
- `NEXT_PUBLIC_*` are inlined at build time; changing them needs a rebuild, not just `wrangler secret put`.
- Cloudflare Workers cannot reach `localhost`. Anything on the Mac (Ollama) needs a tunnel to be visible to the deployed app.

- The webhook URL is permanent: `https://myna-app.aarohan567.workers.dev/api/webhooks/meta`. Every channel and product uses that same URL. No tunnel is in the Meta request path — the only remaining tunnel need is Worker → Ollama, which is a separate concern and does not affect ingest.
- A Meta app can hold **more than one app secret**: the Instagram product shows its own App ID / App Secret, distinct from the app-level pair under Settings → Basic. Instagram webhooks are signed with one, `page` / `whatsapp_business_account` webhooks with the other. If Instagram verifies and the other two 401, that is the cause — not the callback URL.
- `opennextjs-cloudflare deploy` uploads `.env.local` keys to the Worker as **secrets**, blank placeholders included — and a blank one reads as *set* at runtime, so `/channels` showed Messenger as CONNECTED with no Page token. Keep unused keys **commented out** in `.env.local`, not present-but-empty. Audit with `npx wrangler secret list`.
- WhatsApp Cloud API (Aug 30): test number **+1 555 197 6334**, `WA_PHONE_NUMBER_ID=1267812953086415`, `WA_BUSINESS_ACCOUNT_ID=1422085689806117`. The API-Setup token is **temporary (24h)** — for anything lasting, make a System User in Business Settings, assign it the WABA, and mint a permanent token with `whatsapp_business_messaging` + `whatsapp_business_management`.
- Do not confuse **business.facebook.com** (Business Suite inbox — wants to link a personal WhatsApp number, gives no API access) with **developers.facebook.com** (Cloud API — gives phone number ID + token). The Business Suite flow is a dead end for Myna.
- A phone number lives on exactly one WhatsApp surface. Never register a personal number on the Cloud API: it must first be deleted from consumer WhatsApp, which erases that account.

## Sep 8, 2026 update — Instagram delivery is broken on Meta's side

- **Symptom:** a real DM (`test123`, from @asc_aarohan, Sep 7 15:27 UTC) never
  reached the Worker. Neither did the Aug 30 IG messages (`hello`, `hellooo`).
  The last Instagram webhook that was actually delivered is the Aug 25 one —
  i.e. IG delivery has been dead since the move from ngrok to the Worker.
- **Proven not the app:** an HMAC-signed synthetic Instagram event to the
  Worker on Sep 8 ingested, Maya answered from the brand doc at 0.95 in ~12s,
  and the only failure was the (expected) unknown-recipient send. The verify
  handshake still returns the challenge. Account-level
  `me/subscribed_apps` shows `messages` subscribed. So the gap is the
  **app-level webhook config for the Instagram product** in the Meta
  console: callback URL still pointing at the dead Aug 25 ngrok URL, or the
  `messages` field unsubscribed there. Fix in the console: App → Instagram →
  Webhooks (or Products → Webhooks → Instagram): callback
  `https://myna-app.aarohan567.workers.dev/api/webhooks/meta`, verify token
  = `META_VERIFY_TOKEN`, subscribe `messages`, then use **Test** — it should
  show up in `npx wrangler tail myna-app` as `[webhook] accepted instagram`.
  This cannot be read via the API: `/{app-id}/subscriptions` needs the
  app-level secret and `META_APP_SECRET` is the Instagram-product one.
- The `test123` message was **replayed by hand** into the Worker (signed,
  real `mid`, so a late Meta redelivery dedupes). It is in the inbox now,
  held for human at 0.9 ("message is unclear"). Approve & send from `/inbox`
  to demo the round trip.
- `Customer ·1635` was the same @asc_aarohan thread; name backfilled to
  "Aarohan (@asc_aarohan)". The Aug 25 code predated `fetchCustomerName`.
- **"Aàrohan" is not seeded** — it is the WhatsApp profile name from the
  webhook (`contacts[].profile.name`), i.e. whatever the sender's phone has
  as their WhatsApp name. Instagram names come from Graph (`name`/`username`).
- **New: `GET /api/health`** (`?text=1` for the shell). Live-probes Supabase,
  Ollama through the tunnel (models present), the Instagram token +
  `subscribed_apps`, the WhatsApp token, and shows last-inbound-per-channel
  so a silently unsubscribed webhook is visible. 503 when anything fails,
  each failure names the fix. Basic-auth gated.
- **New: `POST /api/maintenance/refresh-ig-token`** mints a fresh 60-day IG
  token from the current one and stores it on the `channel_connections`
  rows (which `reply.ts`, the manual-send route and the webhook already
  prefer over env). Skips when the stored token has >50 days left.
  `lib/meta.ts` gained `instagramToken()` (DB-then-env) and
  `refreshInstagramToken()`.
- `scripts/demo-up.sh` now ends by calling the refresh and printing
  `/api/health?text=1`. Read that output; do not start the demo on NOT READY.
- **Still on Meta's side / needs a human:** (1) fix the Instagram webhook
  config above; (2) WhatsApp System User token; (3) claim a free static
  ngrok domain (dashboard → Domains) and change `demo-up.sh` to
  `ngrok http 11434 --url=<that-domain>` so the Worker secret never changes;
  (4) a Cloudflare Cron Trigger for the token refresh once the OpenNext
  worker entry is customised — until then demo-up.sh is the cron.

## Sep 8, 2026 (later) — demo flow: catalogue → book → human confirms

- **Brand is now Monso Eyewear** (sunglasses, 5 SKUs MS-01…MS-05, Rs 1,950–3,500)
  — `scripts/seed-monso-eyewear.mjs` is idempotent: sets brand name/tone,
  upserts `products`, replaces the brand doc with
  `scripts/demo/monso-eyewear-guide.md` via the deployed upload route.
- **Migration `003_orders.sql`** (applied): `products` (brand_id, sku, name,
  description, price, in_stock, sort_order) and `orders` (order_number
  identity, conversation_id, items jsonb, total, customer_name,
  delivery_address, phone, status pending/confirmed/cancelled).
- **Maya v2 (`lib/reply.ts`)**: one of four intents — `answer`, `catalogue`
  (server appends the exact price list from `products`, model writes only
  the intro line), `book_order` (server matches SKU/name, inserts a pending
  order, sends a deterministic "✅ Order booked & saved … we'll get back to
  you to confirm" and sets the thread `needs_human`), `handoff` (held as a
  draft). **Auto-send is the default**; only `handoff` or confidence < 0.5
  holds. Catalogue + brand doc chunks both go in the prompt; prices come
  from `products`, never from the model.
- **Human step:** `PATCH /api/orders/:id {status: confirmed|cancelled, note?}`
  messages the customer on their channel and flips the order. In the inbox:
  "🧾 Order to confirm" tag in the list, order card with Confirm/Cancel in
  the right panel, `GET …/messages` now also returns `orders`.
- `scripts/play-demo.mjs` rehearses the whole thing against the Worker with
  a fake customer (Graph send fails as expected, everything else is real).
  Verified Sep 8: hello → auto answer; "price please" → intro + 5-line
  catalogue; "I'll take the wayfarer… address, phone" → order #1 booked
  with address/phone extracted; PATCH confirm → confirmation text.
  ~16s per turn through the tunnel. Clean up with
  `node scripts/purge-sim-data.mjs --apply` (now also deletes the fake
  customer's conversation).
- Old test threads (WhatsApp Hi/Hii/Dog, Instagram test123) deleted, so the
  first real DM starts a clean thread.
- Multi-line replies: `.msg` / `.draft-bubble` are `white-space: pre-wrap`.
- **Every `npm run deploy` overwrites `OLLAMA_BASE_URL` with localhost** (it
  uploads `.env.local`). Always run `scripts/demo-up.sh` after deploying.
- **Booking guards (`lib/reply.ts`)** after rehearsal bugs: (1) Maya's history
  now includes `failed` outbound messages, otherwise she loses her own
  context whenever a send fails; (2) the model's `book_order` is accepted only
  if the latest message has a buy word (English / romanised Nepali), a
  quantity change, or is a bare product code right after the catalogue —
  else it is downgraded to `answer` (a delivery question after a booking was
  creating order #2); (3) a bare code after the catalogue or "make it 2 pairs"
  on a pending order is upgraded to `book_order` server-side (the model was
  narrating "your order is booked" without saving anything); (4) a booking
  for a SKU that already has a pending order **updates** it instead of
  stacking. Retrieval k=4. Final rehearsal Sep 8: what do you sell → list ·
  "MS-03" → booked #3 · delivery/polarised question → answered, no booking ·
  "make it 2 pairs + address + phone" → #3 updated to ×2, Rs 5,600 ·
  "discount for 2?" → held. 7–19s per turn.

## Sep 8, 2026 (later still) — Workers AI, hot-switchable; ngrok no longer required

- **`lib/llm.ts` now has two providers**: `ollama` (local, via ngrok) and
  `cloudflare` (Workers AI: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` chat,
  `@cf/baai/bge-m3` embeddings, 1024-dim). Selection: `LLM_PROVIDER` secret
  if set, else Workers AI when the `AI` binding exists (deployed), else
  Ollama (`next dev`). **The "local AI only" locked decision is superseded**
  — the deployed app runs on Workers AI as of Sep 8.
- `wrangler.jsonc` has `"ai": { "binding": "AI" }`. No API token needed.
- **Switch:** `bash scripts/llm-switch.sh cloudflare|ollama|auto` — sets the
  secret, calls `POST /api/maintenance/reindex` (re-embeds every doc with the
  active model; the two embedding spaces are incompatible), prints health.
  `/api/health` reports the active provider under `llm`.
- Rehearsal on Workers AI: 5–8s per turn (was 7–28s via the tunnel), all
  five turns correct, better answers (quoted the Rs 150–250 delivery charge,
  explained the no-discount policy before holding).
- ngrok / `demo-up.sh` only matter if you switch back to `ollama`. Still run
  demo-up.sh before a demo for the health print — it is harmless on
  Workers AI (the OLLAMA_BASE_URL push is ignored).
- Meta webhook config lives at **Instagram → API setup with Instagram login →
  2. Configure webhooks** (not the "Webhooks" product page). Callback =
  Worker URL, verify token = `META_VERIFY_TOKEN`; all fields incl.
  `messages` subscribed.

## Sep 17, 2026 — TypeSafe (Jev) triage in front of Maya

**What it is.** Every inbound DM is now judged by TypeSafe's Jev model
(`lib/triage.ts`) *before* Maya writes anything. Jev returns typed judgments
with probabilities rather than text: one Choice (`intent`), two Scores
(`frustration`, `warmth`, both 0–2) and two Nouls (`needs_human`,
`asks_for_human`). All five are independent questions over the same state, so
they go in **one** request — ~800 input tokens, ~1s.

**Why it earns its place.** It replaces three things that were guesses:
1. `decision.confidence` was the chat model grading its own homework. Jev's
   `confidence` is a statistic over a distribution on a fixed question.
2. The `SENSITIVE` / `BUY_WORDS` regexes were a keyword list standing in for
   meaning. They miss romanised Nepali that isn't on the list and fire on any
   message containing "return".
3. Sentiment was invisible — an angry customer and a curious one routed
   identically.

**Measured** (`node --env-file=.env.local scripts/typesafe-smoke.mjs`, 11 real
message shapes, all asserted intents correct, model `jev-1.13.0`):
- `"is the wayfarer polarised?"` asked *after* a booking → `question` @0.98.
  This is the bug the `bookingIsExplicit` regex exists to paper over.
- `"price please"` → `catalogue` @0.93; `"MS-03"` after the list → `buy` @1.00.
- `"hello?? anyone there?"` → frustration **1.00** → held for a human. A
  chasing customer no longer gets another cheerful auto-reply.
- angry refund demand → `complaint` @1.00, frustration 1.98, needs_human 0.92.
- **Cost: $0.038 per 1000 messages.** Input tokens only — TypeSafe does not
  bill output. $5 of credit is ~130,000 messages.

**Where policy lives.** `verdictFor()` in `lib/triage.ts`, in code, not in the
model. `complaint` and `negotiation` hold *unconditionally* regardless of
probability, because the demo promises Maya never haggles or handles a
grievance — a reasonable 0.52 on needs_human is still not a licence to
negotiate. Thresholds: asks_for_human ≥ 0.5, frustration ≥ 1.0,
needs_human ≥ 0.6, intent confidence < 0.5.

**Failure is never fatal.** Any error — missing key, timeout, rate limit —
returns `null` from `triageMessage()` and `lib/reply.ts` falls back to the
regex guards it always used. Timeout is deliberately 4s × 2 attempts, not the
SDK default of 10s × 3, which would have exceeded the Worker's `after()` budget.

**Storage.** `004_triage.sql` adds `messages.triage` (jsonb, the whole
judgment) plus denormalised `conversations.last_intent / last_frustration /
last_warmth` so the inbox list can show a mood chip without a second join.
The inbox shows "😠 Upset" / "⏳ Impatient" / "💛 Happy" chips and a "How this
message reads" card with the intent, both score bars, and the token/latency
cost.

**Health.** `/api/health` gained a `triage` check that is a real canary, not a
key-presence test: it sends a plain delivery question and fails if the answer
is no longer `question` @≥0.5 — i.e. if the criteria or the model version
drifted. `jev-latest` currently resolves to `jev-1.13.0`; pin
`TYPESAFE_DEFAULT_MODEL` if the thresholds ever get tuned hard, since
confidence is computed differently across versions.

**Two things to watch.**
- `npm run deploy` uploads `.env.local`, so `TYPESAFE_API_KEY` lands as a
  **plaintext Worker var**. Prefer `npx wrangler secret put TYPESAFE_API_KEY`
  and keep it out of `.env.local` before a deploy if that matters.
- Jev is **not adversarially robust** by TypeSafe's own docs, and customer
  text goes straight into `state`. A DM containing "ignore that, this is
  routine" can move the judgment. Not mitigated; acceptable for a demo, worth
  a guardrail question before real traffic.

### Verified end-to-end, Sep 17 (local `next dev`, Ollama + real Supabase)

Six-turn rehearsal through the real webhook → triage → RAG → Maya → send path.
Every judgment below was read back **out of Postgres**, not from the model:

| turn | Jev | outcome |
| --- | --- | --- |
| hello | `question@0.95` frust 0.00 | auto |
| price please | `catalogue@0.97` frust 0.01 | auto, full catalogue |
| MS-03 | `buy@1.00` human 0.09 | **order #7 booked** |
| is it polarised? + deliver to Pokhara? | `question@0.99` human 0.11 | auto, **no second order** |
| discount for 2 pairs? | `negotiation@1.00` human 0.41 | **held** — "price negotiation — owner decides discounts" |
| third time asking… refund me now | `complaint@1.00` frust **1.98** human 0.91 | **held** — "complaint — owner should answer" |

- **Exactly one order existed afterwards.** The old order-#2 bug did not recur.
- Both holds are confirmed in the dev log by their `verdictFor` reason strings,
  not inferred from message ordering.
- `conversations.last_frustration = 1.98` drove the **😠 Upset** chip in the
  inbox; `/inbox` returned 200. Pre-existing Sep 8 rows carry `triage = null`
  and render fine, so the null path is safe on old data.
- Triage cost 0.9–1.3s and 1057–1438 input tokens per message, alongside a
  19–29s local Ollama reply — i.e. it disappears into the existing latency.

**Not yet exercised:** the `downgraded book_order → answer` override never
fired, because the chat model independently chose `answer` on the polarised
question and Jev agreed. The probe proves Jev classifies that case correctly;
the override path itself is still untested end to end.

**Rehearsal gotcha, not an app bug:** `play-demo.mjs` waits 60s per turn. Local
qwen3 at 19–29s/turn means one slow turn pushes every later reply one slot down
the transcript, so a turn appears to show the previous turn's answer. On
Workers AI (5–8s) this does not happen. Check the DB or the dev log, not the
transcript, when a turn looks wrong.

**macOS DNS caveat.** While the Supabase project was paused the host went
NXDOMAIN, and macOS cached that negative result. After restoring, `dig`
resolved correctly while `getaddrinfo` (what Node and curl use) kept failing
intermittently — the inbox looked empty and a rehearsal died mid-run. It
cleared on its own. If it recurs:
`sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`.

**`npm run deploy` exit code lies.** `npm run deploy | tail` reports *tail's*
status, so a deploy that threw on missing Cloudflare auth still exited 0. Use
`set -o pipefail`, and confirm a deploy by checking `/api/health` actually
lists the `triage` check — its absence means the old build is still live.

## Sep 18, 2026 — triage shipped, Messenger + WhatsApp both live

`/api/health` returns **READY** for the first time. All three channels now have
a working send path.

**The Jev triage build was never deployed** until today — the Sep 17 work was
local-only. Deployed and verified on Workers AI across all five routes
(auto / catalogue / booking / negotiation-hold / complaint-hold). The
negotiation turn is the meaningful proof: `negotiation@1.00` with
needs_human **0.46**, *below* the 0.6 threshold, still held — confirming
`verdictFor()`'s unconditional hold works deployed, not just locally.
Triage runs 330–440ms, ~1100 tokens.

**Messenger was dead for three separate reasons**, all fixed:
1. App-level `messages` webhook field was **Unsubscribed**
2. The Page was subscribed to **nothing** ("No fields subscribed")
3. **No Page token existed**

Page is **Skarna Store**, `FB_PAGE_ID=1257005504167673`. The Page token is
232 chars, carries `pages_messaging`, and **`expires_at: 0` — never expires**
(no 60-day trap like Instagram). In `.env.local` + Worker secrets.
Verified by Graph returning `(#100) No matching user found` on a fake PSID —
a *recipient* error, not auth. `last inbound — messenger` is now populated.

**WhatsApp now has a permanent token.** System user **`myna-whatsapp`**
(ID `61594408083727`, Admin), assigned two assets: the WABA
(Messages + Manage phone numbers) **and** the `In_myna` app (Develop app).
Token is `type: SYSTEM_USER`, `expires_at: 0`, scopes
`whatsapp_business_messaging` + `whatsapp_business_management`.
`+977 9767658675` was already on the test-number allow-list.
The `channel_connections` whatsapp row keeps `access_token = NULL`, so env
wins — keep it that way.

**`META_APP_SECRET_ALT` is now in `.env.local`** (was Worker-secret-only).
Without it `simulate-dm.mjs` could not correctly sign `page` /
`whatsapp_business_account` events. Retrieved from App settings → Basic →
Show, which requires a password re-prompt.

### Gotchas that cost real time

- **Meta input fields truncate visually.** The Page token showed ~57 chars on
  screen but is 232. Always read `.value` via JS, never the screenshot —
  a truncated token fails silently at send time.
- **The System User "Generate token" wizard failed three times** with
  "No permissions available", even after assigning the WABA. It needs the
  **app** assigned to the system user as well (Accounts → Apps → In_myna →
  Assign people → system user → Develop app). Even then it stayed broken;
  the token was ultimately generated by hand in the console.
- **Graph cannot mint a system user token from a Page token.**
  `POST /{system-user-id}/access_token` needs a *user* token with
  `business_management`; a Page token returns subcode 33 even with a correct
  `appsecret_proof`. `appsecret_proof` must use the **app-level** secret
  (`META_APP_SECRET_ALT`), not the Instagram one.
- **`sed`-replacing a token in `.env.local` mangled it** — produced a 297-char
  value where the token is 203, and Graph then reported the *old* token's
  expiry. Prefer `grep -v` + append over in-place `sed` for secrets, and
  always assert the stored length.
- Business Suite panels show **stale assignment state**; a hard reload is
  required before believing "No assets assigned".

### Still open

- **`pages_messaging` is not App-Review-approved.** Only accounts with a role
  on the app can message the Page and get a reply — not the public. Same
  shape on WhatsApp (allow-list only). Add demo accounts as testers first.
- App is **"Currently ineligible for submission"**: missing App icon
  (1024×1024) and Category. **Terms of Service** and **User data deletion**
  URLs both point at `https://www.facebook.com/` instead of the live
  `/privacy` and `/data-deletion` pages. Fix before submitting.
- Two `instagram` rows in `channel_connections` — `28482564724763771` (correct,
  matches webhook `recipient.id`) and `17841436916236016` (aliased, will never
  match). Prune the latter.
- `"kati parcha?"` (*how much?*) classified `question`, not `catalogue`, so
  Maya answered availability instead of price. Worth tuning before demoing
  in Nepali.
- WhatsApp **inbound has still never fired** (`whatsapp never`). Token and
  webhook config are both correct; it just needs a real message to the test
  number to prove ingest end to end.
