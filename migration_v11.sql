-- migration_v11.sql
-- 服务相关统一支出记录
-- 请手动在 Supabase SQL Editor 中执行；本文件不会自动执行

create table if not exists expense_records (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  type text not null check (type in ('technician_fee', 'insurance', 'other')),
  label text not null,
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  amount numeric not null default 0,
  payment_method text not null check (payment_method in ('advance', 'monthly_settlement')),
  payer_name text,
  is_settled boolean not null default false,
  settled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_records_advance_payer_check check (
    payment_method <> 'advance'
    or nullif(trim(payer_name), '') is not null
  ),
  constraint expense_records_settlement_time_check check (
    is_settled = true
    or settled_at is null
  )
);

create index if not exists expense_records_visit_id_idx
  on expense_records (visit_id);

create index if not exists expense_records_type_idx
  on expense_records (type);

create index if not exists expense_records_settlement_idx
  on expense_records (is_settled, payment_method);

alter table expense_records enable row level security;

do $$
begin
  create policy "team can access expense_records"
    on expense_records
    for all
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');
exception
  when duplicate_object then null;
end $$;