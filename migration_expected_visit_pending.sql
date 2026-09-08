-- 预计上门时间“待定”状态；请在 Supabase SQL Editor 手动执行。
-- 本文件不会自动执行任何数据库操作。
alter table orders
  add column if not exists expected_visit_pending boolean not null default false;