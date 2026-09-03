-- migration_v15.sql
-- 将施工证要求从订单级设置迁移到门店级设置
-- 请手动在 Supabase SQL Editor 中执行；本文件不会自动执行

alter table stores
  add column if not exists requires_construction_permit boolean not null default false;