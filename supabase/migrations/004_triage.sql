-- Jev triage (TypeSafe System One) on inbound messages.
--
-- Two shapes on purpose. `messages.triage` keeps the whole judgment for the
-- message it belongs to — the thread view and any later analysis read it
-- there. The two columns on `conversations` are a deliberate denormalisation
-- so the inbox list can show "Upset" on a row without joining every message
-- and re-sorting; that list already renders 1 message per conversation and
-- adding a second lateral join for a badge is not worth it.

alter table messages
  add column if not exists triage jsonb;

comment on column messages.triage is
  'Jev judgment of this inbound message: {intent, intentConfidence, intentProbabilities, frustration, warmth, needsHuman, asksForHuman, tokens, latencyMs, model}. Null when TypeSafe was unreachable or the message is outbound.';

alter table conversations
  add column if not exists last_intent text,
  add column if not exists last_frustration numeric(4, 3),
  add column if not exists last_warmth numeric(4, 3);

comment on column conversations.last_intent is
  'Jev intent of the most recent inbound message — denormalised for the inbox list badge.';

-- Partial index: the "who is angry right now" query the owner cares about.
-- Only upset rows are indexed, which is a small fraction of the table.
create index if not exists conversations_upset_idx
  on conversations (brand_id, last_message_at desc)
  where last_frustration >= 1.0;
