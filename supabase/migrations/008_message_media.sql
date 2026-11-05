-- Photos customers send (WhatsApp media id, or Instagram/Messenger CDN url),
-- so Maya can look at them. Additive and nullable: existing rows unaffected.
alter table messages add column if not exists media jsonb;
