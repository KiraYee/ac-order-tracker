-- migration_v3 的补充，跟 v3 一起在 Supabase SQL Editor 执行即可（顺序不影响，字段独立）

alter table visits add column if not exists technician_id uuid references technicians(id);
