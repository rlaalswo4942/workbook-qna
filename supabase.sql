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
  nick        text not null check (char_length(nick) between 1 and 30),
  owner_hash  text check (char_length(owner_hash) = 64)  -- 작성자 브라우저 토큰의 SHA-256
);
alter table public.posts add column if not exists owner_hash text check (char_length(owner_hash) = 64);

-- 익명: 누구나 읽고 쓸 수 있음. 직접 수정·삭제는 막고, 본인 삭제는 아래 delete_post 함수로만 허용
alter table public.posts enable row level security;
drop policy if exists "anyone can read" on public.posts;
drop policy if exists "anyone can post" on public.posts;
create policy "anyone can read" on public.posts for select to anon, authenticated using (true);
create policy "anyone can post" on public.posts for insert to anon, authenticated with check (true);

-- 본인 글 삭제: 토큰 원문을 받아 해시가 일치할 때만 삭제 (답변은 cascade로 함께 삭제)
create extension if not exists pgcrypto with schema extensions;
create or replace function public.delete_post(p_id bigint, p_secret text) returns boolean
language sql security definer set search_path = public, extensions as $$
  with d as (
    delete from public.posts
    where id = p_id and owner_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')
    returning 1
  )
  select exists (select 1 from d);
$$;
revoke all on function public.delete_post(bigint, text) from public;
grant execute on function public.delete_post(bigint, text) to anon, authenticated;

-- 본인 마킹 형태 변경(색·형광펜/메모지): 같은 해시 확인. 값 검증은 테이블 check 제약이 한다
create or replace function public.update_mark(p_id bigint, p_secret text, p_color text, p_style text) returns boolean
language sql security definer set search_path = public, extensions as $$
  with u as (
    update public.posts set color = p_color, style = p_style
    where id = p_id and owner_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')
    returning 1
  )
  select exists (select 1 from u);
$$;
revoke all on function public.update_mark(bigint, text, text, text) from public;
grant execute on function public.update_mark(bigint, text, text, text) to anon, authenticated;

-- 실시간 구독 (INSERT/UPDATE/DELETE)
alter publication supabase_realtime add table public.posts;
