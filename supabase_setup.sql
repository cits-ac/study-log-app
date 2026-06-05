-- ============================================================
-- 勉強ログ アプリ — 完全セットアップ（このファイル1本でOK・冪等）
-- Supabase → SQL Editor に貼り付けて実行
-- ============================================================

-- 1. profiles（ユーザ情報・ロール）
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz default now()
);
alter table profiles enable row level security;

-- 2. study_logs（学習記録）— 既存テーブルに列を追加
alter table study_logs add column if not exists user_id uuid references auth.users(id);
alter table study_logs add column if not exists book text;
alter table study_logs add column if not exists topic text;
alter table study_logs add column if not exists page_from integer;
alter table study_logs add column if not exists page_to integer;
-- 科目を廃止しタグ中心にしたため subject は任意（NULL許容）
alter table study_logs alter column subject drop not null;
alter table study_logs enable row level security;

-- 3. books（書籍・教科書マスタ。ユーザごと）
create table if not exists books (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now(),
  unique(user_id, name)
);
alter table books enable row level security;

-- 4. tags（タグマスタ。ユーザごと）
create table if not exists tags (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now(),
  unique(user_id, name)
);
alter table tags enable row level security;

-- ============================================================
-- 注意: RLSポリシーはバックエンド(service role key)で管理するため不要。
-- service role key はRLSをバイパスします。
-- ============================================================
