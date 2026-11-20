-- Sample photos from Pixabay (Alvin, 20 Nov 2026: "Let's go with using the pixabay"). Pixabay's
-- API rules (pixabay.com/api/docs): "To keep the Pixabay API fast for everyone, requests must be
-- cached for 24 hours." findProductImage (v24) keeps each search's answer here, by source,
-- language, set and words, and asks Pixabay again only once a day has passed; now and then it
-- clears out searches over a day old. Only the function reads or writes it (the service role):
-- row level security is on with no policies, and the app's roles have no rights on it.
create table if not exists public.photo_search_cache (
  key text primary key,
  photos jsonb not null,
  fetched_at timestamptz not null default now()
);
create index if not exists photo_search_cache_fetched_at on public.photo_search_cache (fetched_at);
alter table public.photo_search_cache enable row level security;
revoke all on public.photo_search_cache from anon, authenticated;
comment on table public.photo_search_cache is
  'findProductImage''s Pixabay searches, kept 24 hours as Pixabay asks: key "pixabay|<lang>|<set>|<words>", photos = the answer''s photos. Service role only.';
