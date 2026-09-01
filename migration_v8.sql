-- migration_v8.sql
-- 扩展 visits 为服务记录
-- 只新增服务类型和服务内容字段，不修改历史数据
-- 请手动在 Supabase SQL Editor 中执行，不要自动执行

alter table visits
  add column if not exists service_type text;

alter table visits
  add column if not exists service_content text;