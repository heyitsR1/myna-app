-- brand document uploads live in a private bucket
insert into storage.buckets (id, name, public)
values ('brand-docs', 'brand-docs', false)
on conflict (id) do nothing;
