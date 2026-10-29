-- Myna: unified inbox + AI auto-reply for Nepali SMBs
-- 001_init.sql — schema, pgvector, RLS

create extension if not exists vector;

-- ── brands ──────────────────────────────────────────────────────────────────
create table brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null,
  tone_notes text,
  created_at timestamptz not null default now()
);

-- ── channel_connections ─────────────────────────────────────────────────────
create table channel_connections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  channel text not null check (channel in ('instagram', 'whatsapp', 'messenger')),
  external_account_id text not null,
  access_token text,
  token_expires_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (channel, external_account_id)
);

-- ── conversations ───────────────────────────────────────────────────────────
create table conversations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  channel_connection_id uuid not null references channel_connections (id) on delete cascade,
  external_customer_id text not null,
  customer_name text,
  ai_enabled boolean not null default true,
  status text not null default 'open' check (status in ('open', 'needs_human', 'resolved')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel_connection_id, external_customer_id)
);

-- ── messages ────────────────────────────────────────────────────────────────
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('customer', 'ai', 'human')),
  body text not null,
  external_message_id text unique,
  ai_confidence real,
  ai_sources jsonb,
  status text not null default 'sent' check (status in ('sent', 'draft_pending', 'failed')),
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on messages (conversation_id, created_at);

-- ── documents ───────────────────────────────────────────────────────────────
create table documents (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  filename text not null,
  storage_path text not null,
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  chunk_count int,
  created_at timestamptz not null default now()
);

-- ── doc_chunks ──────────────────────────────────────────────────────────────
create table doc_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  brand_id uuid not null references brands (id) on delete cascade,
  content text not null,
  embedding vector(1024),
  chunk_index int not null
);

create index doc_chunks_embedding_idx on doc_chunks
  using hnsw (embedding vector_cosine_ops);

create index doc_chunks_brand_idx on doc_chunks (brand_id);

-- ── similarity search ───────────────────────────────────────────────────────
create or replace function match_doc_chunks(
  query_embedding vector(1024),
  match_brand_id uuid,
  match_count int default 6
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from doc_chunks dc
  where dc.brand_id = match_brand_id
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Owner-scoped policies for authenticated users; the service-role key
-- (used by webhook/ingestion server code) bypasses RLS entirely.

alter table brands enable row level security;
alter table channel_connections enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table documents enable row level security;
alter table doc_chunks enable row level security;

create policy "owners manage their brands"
  on brands for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owners manage their channel connections"
  on channel_connections for all
  using (brand_id in (select id from brands where owner_id = auth.uid()))
  with check (brand_id in (select id from brands where owner_id = auth.uid()));

create policy "owners manage their conversations"
  on conversations for all
  using (brand_id in (select id from brands where owner_id = auth.uid()))
  with check (brand_id in (select id from brands where owner_id = auth.uid()));

create policy "owners manage their messages"
  on messages for all
  using (conversation_id in (
    select c.id from conversations c
    join brands b on b.id = c.brand_id
    where b.owner_id = auth.uid()
  ))
  with check (conversation_id in (
    select c.id from conversations c
    join brands b on b.id = c.brand_id
    where b.owner_id = auth.uid()
  ));

create policy "owners manage their documents"
  on documents for all
  using (brand_id in (select id from brands where owner_id = auth.uid()))
  with check (brand_id in (select id from brands where owner_id = auth.uid()));

create policy "owners manage their doc chunks"
  on doc_chunks for all
  using (brand_id in (select id from brands where owner_id = auth.uid()))
  with check (brand_id in (select id from brands where owner_id = auth.uid()));
