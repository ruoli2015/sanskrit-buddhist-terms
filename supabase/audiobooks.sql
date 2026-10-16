-- Private audiobooks (app/js/books.js, scripts/audiobook/upload.mjs). Run once in the SQL editor.
-- The bucket is private: only accounts listed in audiobook_readers can read it, and only the
-- upload script (with the project's secret key, which bypasses these policies) can write it.

insert into storage.buckets (id, name, public)
values ('audiobooks', 'audiobooks', false)
on conflict (id) do update set public = false;

create table if not exists public.audiobook_readers (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.audiobook_readers enable row level security;

drop policy if exists "readers see their own row" on public.audiobook_readers;
create policy "readers see their own row" on public.audiobook_readers
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "readers read audiobooks" on storage.objects;
create policy "readers read audiobooks" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'audiobooks'
    and exists (select 1 from public.audiobook_readers r where r.user_id = (select auth.uid()))
  );

-- Then give your account access (put your sign-in email between the quotes and run this line):
-- insert into public.audiobook_readers select id from auth.users where email = 'you@example.com' on conflict do nothing;
