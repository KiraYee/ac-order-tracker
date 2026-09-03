-- migration_v16.sql
-- 为订单增加整单报价备注
-- 请手动在 Supabase SQL Editor 中执行；本文件不会自动执行

alter table orders
  add column if not exists quote_note text;