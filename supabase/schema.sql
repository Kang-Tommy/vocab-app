-- ============================================
-- 单词学习应用 · 数据库结构（Supabase PostgreSQL）
-- 使用方法：Supabase 控制台 → SQL Editor → 粘贴运行
-- ============================================

-- 分组表（如：必修一 Unit1、高考真题、今日任务）
create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 单词表
create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  word_key text not null unique,          -- 小写单词，用于查重
  phonetic text not null default '',
  pos text not null default '',            -- 词性，如 v. / n. / adj.
  meaning text not null default '',        -- 中文释义
  forms jsonb not null default '{}'::jsonb, -- 词形变化 {"复数形式":"children","过去式":"went"}
  status text not null default 'new' check (status in ('new', 'known')),
  list_id uuid references public.lists(id) on delete set null,
  review_count int not null default 0,     -- 复习次数
  wrong_count int not null default 0,      -- 答错次数
  created_at timestamptz not null default now()
);

create index if not exists idx_words_status on public.words(status);
create index if not exists idx_words_list on public.words(list_id);
create index if not exists idx_words_created on public.words(created_at);

-- 测试会话表（每次测试一行，用于统计最近成绩）
create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  mode text not null,                      -- e2c / c2e / form / mixed
  scope text not null,                     -- 范围标签（今日新增 / 全部生词…）
  total int not null default 0,
  correct int not null default 0,
  created_at timestamptz not null default now()
);

-- 测试明细表（每题一行，用于错题分析）
create table if not exists public.test_records (
  id uuid primary key default gen_random_uuid(),
  test_id uuid references public.tests(id) on delete cascade,
  word_id uuid references public.words(id) on delete cascade,
  question_type text not null,             -- e2c / c2e / form
  correct boolean not null default false,
  created_at timestamptz not null default now()
);

-- 批量更新单词统计（测试结束后调用一次）
create or replace function public.increment_word_counts(ids uuid[], wrong_ids uuid[])
returns void
language plpgsql security definer
as $$
begin
  update public.words set review_count = review_count + 1 where id = any(ids);
  update public.words set wrong_count = wrong_count + 1 where id = any(wrong_ids);
end;
$$;

-- ============================================
-- 行级安全（RLS）：个人学习应用，匿名可读写。
-- 注意：anon key 是公开的，此策略适合个人自用；
-- 若日后要多用户使用，请改为带登录鉴权的策略。
-- ============================================
alter table public.lists enable row level security;
alter table public.words enable row level security;
alter table public.tests enable row level security;
alter table public.test_records enable row level security;

drop policy if exists "lists anon all" on public.lists;
drop policy if exists "words anon all" on public.words;
drop policy if exists "tests anon all" on public.tests;
drop policy if exists "test_records anon all" on public.test_records;

create policy "lists anon all" on public.lists for all using (true) with check (true);
create policy "words anon all" on public.words for all using (true) with check (true);
create policy "tests anon all" on public.tests for all using (true) with check (true);
create policy "test_records anon all" on public.test_records for all using (true) with check (true);
