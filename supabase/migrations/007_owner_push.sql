-- Owner phone app: Web Push subscriptions + the Autopilot switch.
--
-- push_subscriptions: one row per device the owner turned notifications on
--   for (the browser's PushSubscription). Written and read only by the
--   server with the service-role key, so RLS is on with no policies.
-- brands.autopilot: when true, Maya confirms orders herself and the owner
--   just gets a "confirmed" notification. Off by default.
-- orders.confirmed_by: who confirmed — 'owner' or 'maya' (Autopilot). Null on
--   older rows and whenever the writer doesn't say.
--
-- Additive only; safe to re-run.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

alter table brands add column if not exists autopilot boolean not null default false;

alter table orders add column if not exists confirmed_by text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_confirmed_by_check') then
    alter table orders
      add constraint orders_confirmed_by_check check (confirmed_by is null or confirmed_by in ('owner', 'maya'));
  end if;
end $$;
