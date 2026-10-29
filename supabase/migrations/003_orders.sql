-- Products (the catalogue Maya quotes from) and orders (what she books).
-- Prices are NPR. Orders start `pending` — Maya books, a human confirms.

create table products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  price numeric(12, 2) not null,
  in_stock boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (brand_id, sku)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity,
  brand_id uuid not null references brands (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  items jsonb not null,               -- [{sku, name, quantity, unit_price}]
  total numeric(12, 2) not null,
  customer_name text,
  delivery_address text,
  phone text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index orders_conversation_idx on orders (conversation_id, created_at);

alter table products enable row level security;
alter table orders enable row level security;

create policy "owners manage their products"
  on products for all
  using (brand_id in (select id from brands where owner_id = auth.uid()))
  with check (brand_id in (select id from brands where owner_id = auth.uid()));

create policy "owners manage their orders"
  on orders for all
  using (brand_id in (select id from brands where owner_id = auth.uid()))
  with check (brand_id in (select id from brands where owner_id = auth.uid()));
