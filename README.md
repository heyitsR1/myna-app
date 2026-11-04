# Myna

A unified inbox for Instagram, Facebook Messenger and WhatsApp DMs, plus an AI
assistant called **Maya**. Maya answers customers from an uploaded brand
document, shares the product catalogue, and books orders for the owner to
confirm. It's built for small shops in Nepal (the competitor is sambad.io) as a
mentorship project.

**Stack:** Next.js 16 (App Router) + Tailwind v4, Supabase (Postgres +
pgvector + storage), Meta Graph API webhooks, Workers AI (deployed) or Ollama
(local), TypeSafe Jev for message triage. Deployed on Cloudflare Workers via
OpenNext at https://myna-app.aarohan567.workers.dev (password-gated).

## Quick start

```bash
npm ci
cp .env.example .env.local   # or drop in the .env.local you were sent privately
npm run dev                  # http://localhost:3000 (no password gate locally)
```

The app runs with no keys at all and shows empty states. Each key turns on one
part of it.

## Docs

- [`SETUP.md`](SETUP.md): every service from scratch (Supabase, Ollama, the Meta
  app, Messenger, WhatsApp, deploy).
- [`HANDOFF.md`](HANDOFF.md): a running log of decisions, current state,
  gotchas and open issues. **Read this before changing anything.**
- [`AGENTS.md`](AGENTS.md): Next 16 is newer than most training data, so read
  `node_modules/next/dist/docs/` before writing code.

## Where things live

| Path | What |
| --- | --- |
| `app/(app)/` | `/inbox`, `/brain`, `/channels` screens |
| `app/(legal)/` | public `/privacy` and `/data-deletion` pages (Meta App Review) |
| `app/api/webhooks/meta/route.ts` | single webhook for all three channels (HMAC-verified) |
| `lib/reply.ts` | Maya's pipeline: triage → RAG → intent → send / hold / book |
| `lib/triage.ts` | TypeSafe Jev judgments + `verdictFor()` hold policy |
| `lib/llm.ts` | provider switch: Workers AI or Ollama |
| `lib/meta.ts` | Graph API send paths and token handling |
| `supabase/migrations/` | schema, applied in order 001 → 004 |
| `scripts/` | webhook simulator, demo rehearsal, seed, health / LLM switch |

Secrets never go in git. `.env*` is ignored. The deployed app reads Worker
secrets (`npx wrangler secret list`).
