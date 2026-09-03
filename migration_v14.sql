-- migration_v14.sql
-- 工单状态计时：只记录进入待派工 / 待上门的时间，不回填历史工单
-- 请手动在 Supabase SQL Editor 中执行；本文件不会自动执行

alter table orders add column if not exists pending_assignment_at timestamptz;
alter table orders add column if not exists pending_visit_at timestamptz;