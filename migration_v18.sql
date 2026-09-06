-- migration_v18.sql
-- 为每位师傅增加独立的常用报价预设
-- 请手动在 Supabase SQL Editor 中执行；本文件不会自动执行

create table if not exists technician_fee_presets (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references technicians(id) on delete cascade,
  label text not null,
  unit_price numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists technician_fee_presets_unique_idx
  on technician_fee_presets (technician_id, label);

alter table technician_fee_presets enable row level security;

do $$
begin
  create policy "team can access technician_fee_presets"
    on technician_fee_presets
    for all
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');
exception
  when duplicate_object then null;
end $$;