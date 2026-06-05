-- ============================================================
-- 1. profiles テーブル（ユーザ情報・ロール）
-- ============================================================
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- ============================================================
-- 2. subjects テーブル（ユーザごとの科目）
-- ============================================================
create table if not exists subjects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now(),
  unique(user_id, name)
);

alter table subjects enable row level security;

-- ============================================================
-- 3. study_logs に user_id カラムを追加
-- ============================================================
alter table study_logs
  add column if not exists user_id uuid references auth.users(id);

alter table study_logs enable row level security;

-- ============================================================
-- 注意: RLSポリシーはバックエンド(service role key)で管理するため不要。
-- service role key はRLSをバイパスします。
-- ============================================================
