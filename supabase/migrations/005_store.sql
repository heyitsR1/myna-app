-- The Monso store website (~/mentorship/monso-store) reads and writes these
-- same tables — one catalogue, one order book, shared with Maya.
--
-- products: storefront fields. All nullable/defaulted so Maya's code and the
--   seed script keep working untouched.
-- orders: website orders have no DM conversation, so conversation_id becomes
--   nullable and `source` says where the order came from. `shipped` joins the
--   status set for the store's back office; Maya still only books `pending`
--   and the inbox PATCH still only moves pending → confirmed | cancelled.

alter table products
  add column slug text,
  add column image_url text,
  add column gallery text[] not null default '{}',
  add column details text,            -- longer storefront copy (description stays Maya's one-liner)
  add column stock int check (stock is null or stock >= 0);

create unique index products_brand_slug_idx on products (brand_id, slug) where slug is not null;

alter table orders
  alter column conversation_id drop not null,
  add column source text not null default 'dm' check (source in ('dm', 'website')),
  add column delivery_fee numeric(12, 2),
  add column payment_method text,
  add column shipped_at timestamptz;

alter table orders drop constraint orders_status_check;
alter table orders
  add constraint orders_status_check check (status in ('pending', 'confirmed', 'shipped', 'cancelled'));

-- A website order must say who it's for; a DM order has its conversation.
alter table orders
  add constraint orders_has_customer check (
    conversation_id is not null or (customer_name is not null and phone is not null)
  );
