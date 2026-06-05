-- 学習記録に「書籍名・項目名・ページ範囲」を追加
alter table study_logs add column if not exists book text;
alter table study_logs add column if not exists topic text;
alter table study_logs add column if not exists page_from integer;
alter table study_logs add column if not exists page_to integer;
