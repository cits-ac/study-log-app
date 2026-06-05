-- 学習記録に「書籍名・項目名・ページ範囲」を追加
alter table study_logs add column if not exists book text;
alter table study_logs add column if not exists topic text;
alter table study_logs add column if not exists page_from integer;
alter table study_logs add column if not exists page_to integer;

-- 事前登録できる書籍マスタ（ユーザごと）
create table if not exists books (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now(),
  unique(user_id, name)
);

alter table books enable row level security;
