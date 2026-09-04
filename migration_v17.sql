-- migration_v17.sql
-- 记录工单进入「维修中」的时间，用于识别维修中超过 7 天未解决
-- 请手动在 Supabase SQL Editor 中执行；本文件不会自动执行

alter table orders add column if not exists in_progress_at timestamptz;