-- 事前登録できるタグマスタ（ユーザごと）
create table if not exists tags (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now(),
  unique(user_id, name)
);

alter table tags enable row level security;

-- 科目を廃止するため subject を任意（NULL許容）にする
alter table study_logs alter column subject drop not null;
