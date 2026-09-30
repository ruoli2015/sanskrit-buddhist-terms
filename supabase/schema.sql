-- Sync schema for the Sanskrit Buddhist Terms app.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.

-- Progress, custom words, notes and settings: one row per document, last-writer-wins.
create table if not exists public.user_docs (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null,             -- 'progress' | 'custom' | 'note' | 'settings'
  key        text not null,
  data       jsonb not null,            -- { v: <document>, deleted: bool }
  updated_at bigint not null,           -- client timestamp (ms), decides conflicts
  synced_at  timestamptz not null default now(),  -- server time, used as the pull cursor
  primary key (user_id, kind, key)
);
create index if not exists user_docs_pull on public.user_docs (user_id, synced_at);

-- Review log: append-only, so answers from several offline devices all survive.
create table if not exists public.reviews (
  id        uuid primary key,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data      jsonb not null,
  synced_at timestamptz not null default now()
);
create index if not exists reviews_pull on public.reviews (user_id, synced_at);

alter table public.user_docs enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "own docs" on public.user_docs;
create policy "own docs" on public.user_docs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own reviews" on public.reviews;
create policy "own reviews" on public.reviews
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.user_docs to authenticated;
grant select, insert, update on public.reviews to authenticated;

-- Upsert that only overwrites when the incoming document is newer.
create or replace function public.upsert_docs(docs jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.user_docs (user_id, kind, key, data, updated_at)
  select auth.uid(), d->>'kind', d->>'key', d->'data', (d->>'updated_at')::bigint
  from jsonb_array_elements(docs) as d
  on conflict (user_id, kind, key) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        synced_at = now()
    where public.user_docs.updated_at < excluded.updated_at;
$$;

revoke all on function public.upsert_docs(jsonb) from public, anon;
grant execute on function public.upsert_docs(jsonb) to authenticated;
