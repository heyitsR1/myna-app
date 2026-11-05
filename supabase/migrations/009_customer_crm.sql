-- Light CRM on top of conversations: the owner's private note and tags per customer.
alter table conversations add column if not exists notes text;
alter table conversations add column if not exists tags text[] not null default '{}';
