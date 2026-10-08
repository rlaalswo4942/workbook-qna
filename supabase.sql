-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run
create table if not exists public.posts (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  chapter     text not null check (char_length(chapter) <= 20),
  parent_id   bigint references public.posts(id) on delete cascade,
  block       text check (char_length(block) <= 20),
  start_offset int check (start_offset >= 0),
  quote       text check (char_length(quote) <= 300),
  color       text check (color in ('yellow', 'pink', 'green', 'blue')),
  style       text check (style in ('highlight', 'sticky')),
  body        text not null check (char_length(body) between 1 and 2000),
  nick        text not null check (char_length(nick) between 1 and 30)
);

-- 익명: 누구나 읽고 쓸 수 있지만 수정/삭제는 불가 (삭제는 대시보드에서 관리자만)
alter table public.posts enable row level security;
drop policy if exists "anyone can read" on public.posts;
drop policy if exists "anyone can post" on public.posts;
create policy "anyone can read" on public.posts for select to anon, authenticated using (true);
create policy "anyone can post" on public.posts for insert to anon, authenticated with check (true);

-- 실시간 구독
alter publication supabase_realtime add table public.posts;
