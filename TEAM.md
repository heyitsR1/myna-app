# Myna: start here (team)

Myna is an AI DM inbox for small Nepali shops. **Maya** answers Instagram,
WhatsApp and Messenger DMs in Nepali, English or romanised Nepali. She sends
product photos, books orders and hands anything tricky to the owner. The owner
runs the shop from a phone app (Home Screen PWA) with push notifications.

We demo it live at Nepal's Third National Summit on AI on **7 Nov 2026**. The
demo shop is **Monso Eyewear** (sunglasses).

## Try it (5 minutes)

1. **Be a customer.** DM **@monso.eyewear** on Instagram, or WhatsApp
   **+977 976-8578052**. Ask anything: "kati parcha?", "which one for bike
   riding?", "send photos", or order: "MS-03 chahiyo, Koteshwor, 98XXXXXXXX".
2. **Be the owner.** On your phone, open **https://myna.tailsgate.com/m** and
   log in with the username and password you were sent privately.
   - iPhone: Safari → Share → **Add to Home Screen**, open it from the Home
     Screen, log in again, then tap **Turn on notifications**.
   - Tabs:
     - **Today** shows Maya's day and what needs you.
     - **Chats** has every DM, with replies and Maya on/off per chat.
     - **Orders** lists orders with one-tap confirm.
     - **Customers** is the CRM: tags and private notes.
   - The gear on Today has the Autopilot switch. When it's on, Maya confirms
     orders herself.
3. **Desktop:** https://myna.tailsgate.com/inbox has the three-pane inbox,
   `/brain` holds the shop guide Maya reads, and `/channels` manages the
   channel connections.

All logins share the same shop, so you'll see each other's test chats.
Anything you do as the owner is real: confirming an order messages that
customer.

**Feedback we want:** anything that feels slow, confusing or fake, every Maya
reply that sounds wrong, and ideas for the demo.

## Links

| What | Where |
|---|---|
| Owner phone app | https://myna.tailsgate.com/m |
| Desktop inbox | https://myna.tailsgate.com/inbox |
| Live projector wall | https://myna.tailsgate.com/wall |
| Shop on Instagram | https://instagram.com/monso.eyewear (DM link: https://ig.me/m/monso.eyewear) |
| Shop on WhatsApp | https://wa.me/9779768578052 |
| Shop on Messenger | https://m.me/1409707462227849 (may not reach strangers yet) |
| Shop website (alt demo: "Myna plugs into your site") | https://monso.tailsgate.com |
| Code (this repo) | https://github.com/heyitsR1/myna-app |

## Run it locally

```bash
npm ci
cp .env.example .env.local   # or use the private .env.local from the encrypted bundle
npm run dev                  # http://localhost:3000, no login locally
```

The local app talks to the **live** database and the real Meta accounts, so
a reply you send from localhost really reaches the customer. Don't deploy
(`npm run deploy`) without telling Aarohan: there is one production Worker.

Useful scripts:

- `node scripts/simulate-dm.mjs instagram "kati parcha?" --url http://localhost:3000`
  sends a fake signed DM to any deployment.
- `node scripts/load-test.mjs 20` makes 20 fake customers DM the live app at
  once. Then run `node scripts/load-test.mjs --cleanup` to remove them.
- `node scripts/predemo-check.mjs` checks every channel before the demo.

## How it works (one paragraph)

1. Meta sends every DM to `app/api/webhooks/meta`, which checks the HMAC
   signature, stores the message and answers in the background.
2. `lib/reply.ts` runs TypeSafe Jev triage first. Abuse, discount requests,
   complaints and people asking for a person go straight to the owner.
3. Everything else goes to Claude Haiku 5.5 (`lib/agent.ts`) with four tools:
   price list, product photos, book order, hand off to owner.
4. If Claude fails, Workers AI Llama 3.3 70B is the fallback.
5. New orders and handoffs send a Web Push to the owner (`lib/push.ts`).
6. The phone app lives in `app/(phone)` and `components/phone`.

## Load test (5 Nov)

- 20 simultaneous customers: 20/20 answered, median 7.3 s, slowest 9.2 s.
- 50 simultaneous customers: 50/50 answered, median 7.8 s, slowest 12.3 s.

## Rules

- Never commit secrets. `.env*` is gitignored, and the deployed keys are
  Cloudflare Worker secrets.
- Never test with a real person's number. The simulators use unroutable ids.
- Read `HANDOFF.md` before changing anything big.

## Prompt for your AI agent

Paste this into Claude Code, Codex or Cursor, opened in this repo:

> You're helping on **Myna** (repo: this folder), an AI DM inbox for small
> Nepali shops, demoed live on 7 Nov 2026 with the demo shop Monso Eyewear.
> Read `TEAM.md`, then `README.md`, `HANDOFF.md` and `AGENTS.md` before
> touching code.
>
> Stack:
> - Next.js 16 App Router and Tailwind v4 on Cloudflare Workers (OpenNext).
> - Supabase Postgres.
> - Meta webhooks for Instagram, WhatsApp and Messenger.
> - Claude Haiku 5.5 tool loop in `lib/agent.ts`, with Llama fallback.
> - Triage in `lib/reply.ts`.
> - Owner PWA in `app/(phone)` and `components/phone`, with Web Push in
>   `lib/push.ts`.
>
> Constraints:
> - `.env.local` hits the LIVE database and real Meta accounts, so anything
>   that sends a message reaches a real customer.
> - Never run `npm run deploy`, database migrations, or anything that
>   messages customers without asking me first.
> - Never commit secrets.
> - For phone UI, follow the existing `ph-*` classes in
>   `app/(phone)/phone.css`. Respect safe areas and 16px inputs, and gate
>   `:hover` styles behind `(hover: hover)`.
>
> My first task: [describe what you want to try or review].
