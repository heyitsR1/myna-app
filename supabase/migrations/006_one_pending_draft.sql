-- One pending AI draft per conversation.
--
-- On 5 Nov three abusive messages in one thread produced three identical
-- "a team member will get back to you" drafts. `lib/reply.ts` now updates the
-- existing draft instead of inserting another; this index makes that hold
-- under concurrency too (two webhooks for the same thread racing), because
-- the losing insert gets 23505 and falls back to the update.

-- Collapse existing duplicates first: keep the newest pending draft, mark the
-- older ones failed so they drop out of the approval UI but stay auditable.
update messages m
set status = 'failed'
where m.status = 'draft_pending'
  and exists (
    select 1 from messages n
    where n.conversation_id = m.conversation_id
      and n.status = 'draft_pending'
      and (n.created_at, n.id) > (m.created_at, m.id)
  );

create unique index if not exists messages_one_pending_draft_idx
  on messages (conversation_id)
  where status = 'draft_pending';
