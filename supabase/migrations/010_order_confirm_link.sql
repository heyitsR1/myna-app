-- The customer's order-check page (/o/<token>). Additive only.
--   public_token: unguessable random token in the link Maya sends; the page
--     shows only the order it belongs to. Null on orders booked before this.
--   customer_confirmed_at: the customer pressed "Looks right". It does NOT
--     replace the owner's confirm (status stays as the owner leaves it).
--   customer_edits: [{at, field, from, to}] for address / phone / quantity
--     fixes made on that page, so the owner can see what changed.
alter table orders add column if not exists public_token text;
alter table orders add column if not exists customer_confirmed_at timestamptz;
alter table orders add column if not exists customer_edits jsonb not null default '[]'::jsonb;

create unique index if not exists orders_public_token_idx on orders (public_token) where public_token is not null;
