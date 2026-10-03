-- migration_v10.sql
-- 门店唯一身份调整为：城市 + 品牌 + 商场
-- 请手动在 Supabase SQL Editor 中执行；本文件不会自动执行

drop index if exists stores_identity_unique_idx;

create unique index if not exists stores_identity_unique_idx
  on stores (city, brand, mall);