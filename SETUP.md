# Myna — Setup

Myna is a unified inbox (Instagram / WhatsApp / Facebook DMs) with an AI
assistant, **Maya**, who answers customers from your uploaded brand documents.
The app builds and runs with no keys at all (you'll see friendly empty states);
each section below lights up one part of it.

```bash
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3000
```

---

## 1. Supabase (database + storage)

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. In **Project Settings → API**, copy into `.env.local`:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only — never expose it)
3. Run the migration. Either paste `supabase/migrations/001_init.sql` into the
   **SQL Editor** and run it, or with the Supabase CLI:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   This creates the tables, enables **pgvector**, adds the
   `match_doc_chunks` similarity function, and turns on RLS (owner-scoped
   policies; the service-role key used by server code bypasses RLS).
4. Create the storage bucket: **Storage → New bucket**, name it exactly
   `brand-docs`, keep it **private**.

Restart `npm run dev` after editing `.env.local`.

## 2. Ollama (local AI — Maya's brain)

Maya runs on a local model via [Ollama](https://ollama.com). No API key needed.

```bash
brew install ollama          # or download the app from ollama.com
ollama serve                 # skip if the desktop app is already running

ollama pull qwen3:8b         # chat model for replies
ollama pull mxbai-embed-large  # embedding model (1024 dims, matches the schema)

curl http://localhost:11434/api/tags   # verify — should list both models
```

Defaults are already in `.env.example` (`OLLAMA_BASE_URL=http://localhost:11434`,
`OLLAMA_CHAT_MODEL=qwen3:8b`, `OLLAMA_EMBED_MODEL=mxbai-embed-large`); only
change them if you run Ollama elsewhere or want different models.

> **Honest note:** an 8B local model is noticeably weaker than hosted frontier
> models for customer-facing replies — expect more held drafts and the odd
> clumsy phrasing. `lib/llm.ts` is a thin provider abstraction precisely so you
> can A/B a hosted model later without touching the rest of the pipeline.

If Ollama isn't running, nothing crashes: incoming messages are stored and the
conversation is marked **Needs you** instead of getting an AI reply.

## 3. Meta developer app (Instagram DMs)

You need: an Instagram **professional** account (Business or Creator — switch in
the Instagram app under Settings → Account type), and a Meta developer account.

### 3.1 Create the app

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App**.
2. Choose **Business** as the app type, name it (e.g. "Myna Dev").
3. In **App settings → Basic**, copy **App ID** → `META_APP_ID` and
   **App secret** → `META_APP_SECRET` in `.env.local`.

### 3.2 Add the Instagram product

1. On the app dashboard, **Add product → Instagram → Set up**
   (this is the "Instagram API with Instagram Login" product).
2. Under **API setup with Instagram login**, connect your Instagram
   professional account. Add it as an **Instagram tester** if prompted
   (App roles → Roles → Add people → Instagram tester, then accept the invite
   in the Instagram app under Settings → Website permissions → Apps and websites).
3. Generate an **access token** for that account. Copy:
   - the token → `IG_ACCESS_TOKEN`
   - the account's ID (shown next to it) → `IG_ACCOUNT_ID`

   This token + account pair is Myna's dev-mode single-brand shortcut — the
   webhook auto-creates the brand and channel connection on the first DM, so
   there's no OAuth flow to build yet.

### 3.3 Webhook subscription

**The callback URL is permanent — it is the deployed app, not a tunnel:**

```
https://myna-app.aarohan567.workers.dev/api/webhooks/meta
```

Every channel uses this same URL. Set it once per product and leave it.

1. Make sure `META_VERIFY_TOKEN` is set as a Worker secret (`npx wrangler
   secret list` to check). Its value is in the private secrets bundle / `.env.local`, not in git.
2. In the app dashboard under **Instagram → Webhooks** (or Products →
   Webhooks → Instagram), click **Configure**:
   - Callback URL: the URL above
   - Verify token: the exact `META_VERIFY_TOKEN` value

   Meta sends a GET handshake; the route echoes `hub.challenge` when the token
   matches. Confirm it yourself first:

   ```bash
   curl "https://myna-app.aarohan567.workers.dev/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=$META_VERIFY_TOKEN&hub.challenge=ok"
   # → ok
   ```
3. Subscribe to the **`messages`** field.
4. Subscribe the **account** as well — a separate step from verifying the URL,
   and the usual reason nothing arrives:

   ```bash
   curl -X POST "https://graph.instagram.com/v23.0/me/subscribed_apps?subscribed_fields=messages" \
     -H "Authorization: Bearer $IG_ACCESS_TOKEN"
   ```

> Verifying the callback URL and subscribing the account are **two different
> things**. Meta shows a green tick for the first while delivering nothing,
> because the second is missing. Check with the matching `GET` — a response of
> `{"data":[]}` means unsubscribed.

### 3.4 Permissions & review

- Dev mode needs `instagram_business_basic` and
  `instagram_business_manage_messages` — available immediately, but **only for
  accounts with a role on the app** (your tester account).
- In dev mode, DM your connected account **from another Instagram account that
  also has a role on the app** (add it as a tester too).
- Going live with real customers requires **App Review** for those two
  permissions plus business verification — not needed while developing.

### 3.5 Try it

DM your connected Instagram account. The webhook stores the message, Maya
retrieves matching passages from your uploaded documents, and either replies
automatically (confidence ≥ 0.8) or holds a draft for approval in the inbox.

## 3b. Facebook Messenger (same app, same webhook)

Messenger is the cheapest channel to add: it reuses the Meta app, the webhook
URL and the signature check you already have. Payloads arrive as
`object: "page"` with the same `entry[].messaging[]` shape Instagram uses, so
`app/api/webhooks/meta/route.ts` already routes them.

1. **Create or pick a Facebook Page.** A Page is required — Messenger has no
   concept of a personal-profile inbox.
2. In the app dashboard: **Add product → Messenger → Set up**.
3. Under **Messenger → Settings → Access Tokens**, click **Add or Remove
   Pages**, pick your Page, then **Generate token**. Copy it to
   `FB_PAGE_ACCESS_TOKEN` in `.env.local`.
4. Copy the Page's numeric ID (shown next to the Page name, or under
   Page Settings → About) to `FB_PAGE_ID`.
5. Still in **Messenger → Settings → Webhooks**, point the callback at
   `https://myna-app.aarohan567.workers.dev/api/webhooks/meta` with the same `META_VERIFY_TOKEN`,
   and subscribe the field **`messages`**.
6. Click **Add subscriptions** next to the Page itself. This is a *separate*
   step from verifying the callback URL, and skipping it is the usual reason
   no events arrive.
7. Message the Page from another Facebook account. In dev mode that account
   needs a role on the app; in Live mode with `pages_messaging` approved,
   anyone can.

Cost: free. Permissions needed for public use: `pages_messaging`,
`pages_manage_metadata`.

## 3c. WhatsApp Cloud API (same app, same webhook)

WhatsApp uses a different envelope — `object: "whatsapp_business_account"`,
with messages under `entry[].changes[].value.messages[]` — which the webhook
also handles. The send call needs `messaging_product: "whatsapp"`.

1. In the app dashboard: **Add product → WhatsApp → Set up**. This creates a
   WhatsApp Business Account and a **test phone number** for free.
2. On **WhatsApp → API Setup**, copy:
   - **Phone number ID** → `WA_PHONE_NUMBER_ID` (this is an ID, *not* the
     phone number itself — sending to the number will fail)
   - the temporary access token → `WA_ACCESS_TOKEN`
3. Add your own phone number under **To** → **Manage phone number list**. The
   free test number can only message numbers on that list.
4. Under **WhatsApp → Configuration → Webhook**, set the callback to
   `https://myna-app.aarohan567.workers.dev/api/webhooks/meta`, the same `META_VERIFY_TOKEN`, and
   subscribe the field **`messages`**.
5. WhatsApp from your phone to the test number. It should land in `/inbox`
   tagged `whatsapp`, with the sender's WhatsApp profile name already filled in.

> **The temporary token expires in 24 hours.** For anything beyond a demo,
> create a System User in Business Settings, assign it the WhatsApp Business
> Account, and generate a permanent token with `whatsapp_business_messaging`
> and `whatsapp_business_management`.

Cost: **free for Myna's use case.** A customer message opens a 24-hour service
window; replies inside it are not billed. Only *business-initiated template*
messages cost money, and Myna never sends those. The real cost is setup
friction for a production number: Meta Business verification, a phone number
not already registered on consumer WhatsApp, and display-name approval.

## 3e. The two app secrets (bit us on WhatsApp)

A Meta app built on **Instagram API with Instagram Login** carries **two**
signing secrets, and they are not interchangeable:

| Where in the dashboard | Signs which webhooks | Myna env var |
| --- | --- | --- |
| Instagram → Instagram settings → **Instagram App Secret** | `object: "instagram"` | `META_APP_SECRET` |
| App settings → Basic → **App Secret** | `object: "page"`, `object: "whatsapp_business_account"` | `META_APP_SECRET_ALT` |

Symptom when only one is set: Instagram works perfectly, and Messenger or
WhatsApp return **401** on every delivery while Meta's dashboard shows the
webhook as verified. Meta then retries a handful of times and gives up.

`app/api/webhooks/meta/route.ts` accepts **either** secret, so set both and
every channel verifies. The 401 log line names the object type that failed,
which is the fastest way to spot this:

```bash
npx wrangler tail myna-app --format pretty
# [webhook] 401 — signature check failed for object "whatsapp_business_account"
#   (header present, tried 1 secret(s))
```

## 3d. Simulating a DM without a real account

`scripts/simulate-dm.mjs` posts an HMAC-signed webhook exactly as Meta would,
so you can exercise the whole pipeline before a Page or phone number exists:

```bash
node scripts/simulate-dm.mjs instagram "do you deliver to pokhara?"
node scripts/simulate-dm.mjs messenger "kati parcha?"
node scripts/simulate-dm.mjs whatsapp  "sari cha?"  --url https://myna-app.aarohan567.workers.dev
```

It reads `META_APP_SECRET` from `.env.local`. A wrong secret gets a 401 from
the route, which is the fastest way to confirm signature verification is live.

## 4. Feed Maya's Brain

Open **Brain** in the app and upload a PDF/DOCX/TXT — a price list, FAQ, or
policy document. It's stored in the `brand-docs` bucket, chunked, embedded via
Ollama, and indexed in pgvector. Maya answers only from what you upload.

## 5. Deploy (Cloudflare Workers, password-protected)

The app runs on Cloudflare Workers via OpenNext. This is the **permanent**
home of the app and the one HTTPS callback URL Meta points at. There is no
tunnel in the request path: Meta talks to Cloudflare directly.

```bash
npm run deploy          # opennextjs-cloudflare build && … deploy
```

Live at **https://myna-app.aarohan567.workers.dev**.

### The password gate

`proxy.ts` puts HTTP Basic auth over the whole app, so the demo is private.
Three paths are deliberately **excluded** from it:

| Path | Why it must stay public |
| --- | --- |
| `/api/webhooks/*` | Meta cannot send credentials. The route authenticates every request by HMAC (`X-Hub-Signature-256`) instead — an unsigned POST gets a 401. |
| `/privacy` | Meta's App Review team must be able to read it. |
| `/data-deletion` | Same, and it is a hard requirement for App Review. |

The gate is **off** when `BASIC_AUTH_USER` or `BASIC_AUTH_PASSWORD` is unset,
so local `next dev` is never gated. Both are set as Worker secrets only.

### Secrets

Runtime config lives in Worker secrets, not in the bundle:

```bash
npx wrangler secret list                 # what is set
echo "value" | npx wrangler secret put NAME
npx wrangler secret bulk secrets.json    # many at once (do not commit the file)
```

`NEXT_PUBLIC_*` values are inlined at **build** time from `.env.local`, so a
changed Supabase URL needs a rebuild, not just a secret update.

### Maya on the deployed app

This is the **one** remaining place that needs a tunnel, and it has nothing to
do with Meta. Ollama runs on your Mac, and a Cloudflare Worker cannot reach
`localhost` — so the deployed app needs some route back to your machine to
generate a reply.

Without one, nothing breaks: every message still lands in the inbox, the
conversation is just marked **Needs you** instead of getting a draft. Ingest —
the aggregator — is fully independent of this.

Three ways to close the gap, best first:

1. **Cloudflare Tunnel with a named hostname** (permanent, no ngrok). You
   already have domains on this Cloudflare account, so this gives a fixed
   address like `ollama.tailsgate.com` that survives reboots:

   ```bash
   brew install cloudflared
   cloudflared tunnel login
   cloudflared tunnel create myna-ollama
   cloudflared tunnel route dns myna-ollama ollama.<your-domain>
   cloudflared tunnel run --url http://localhost:11434 myna-ollama
   echo "https://ollama.<your-domain>" | npx wrangler secret put OLLAMA_BASE_URL
   ```

   Set it once. Lock it down with Cloudflare Access before leaving it up — an
   open Ollama endpoint is anyone's free GPU.

2. **A hosted model behind `lib/llm.ts`.** `chatJSON`/`embed` are the only two
   functions to reimplement, and it removes the dependency on your laptop
   being awake. Changing the embedding model means re-embedding every chunk,
   so keep the output at 1024 dims or migrate `vector(1024)`.

3. **A throwaway tunnel** for a one-off demo, if you do not want to set
   anything up. Any tunnel tool works; the URL changes each restart, so
   re-run `wrangler secret put OLLAMA_BASE_URL` each time.

### Logs

```bash
npx wrangler tail myna-app --format pretty
```

The reply pipeline runs in `after()`, so its `[reply]` lines appear seconds
after the webhook's own `200`.

## Daily dev loop

```bash
ollama serve          # Maya's model
npm run dev           # UI work — http://localhost:3000, no password gate
npm run deploy        # ship it; the webhook URL never changes
```

Real DMs always arrive at the **deployed** app, because that is the URL Meta
holds. So the loop is: build locally against the data already in Supabase,
deploy, then send a DM to watch the live path.

To exercise ingest without a real DM — or against localhost — use the
simulator rather than repointing Meta anywhere:

```bash
node scripts/simulate-dm.mjs whatsapp "kati parcha?"
node scripts/simulate-dm.mjs whatsapp "kati parcha?" --url https://myna-app.aarohan567.workers.dev
```

Watch the deployed app work:

```bash
npx wrangler tail myna-app --format pretty
```


## Notes & current limitations

- **No auth yet.** The UI reads through server routes using the service-role
  key (dev-mode single brand). Before multi-tenant use, add Supabase Auth and
  switch the UI to owner-scoped anon queries — the RLS policies are already in
  place for exactly that.
- **Live updates** use a Supabase realtime subscription plus a 10s polling
  fallback (realtime respects RLS, so until auth exists the poller does the work).
- **All three channels are routed.** Instagram, Messenger and WhatsApp ingest
  into one inbox and each has a send path (`lib/meta.ts`). Instagram is the
  only one exercised against a real account so far; the other two are verified
  with signed synthetic webhooks (`scripts/simulate-dm.mjs`) and need a Page /
  phone number to go further.
- **Non-text messages are skipped.** Images, stickers, voice notes and
  attachments are dropped at parse time rather than stored — text only.
- **Reactions, edits and deletions** are ignored; delivery/read receipts are
  ignored by design.
- **TikTok is not possible.** No public API exposes TikTok DMs. Position the
  product as Instagram + Facebook + WhatsApp.
