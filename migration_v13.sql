-- migration_v13.sql
-- 将费用记录统一关联到订单；保险费可选关联师傅，不要求关联 visit
-- 请手动在 Supabase SQL Editor 中执行；本文件不会自动执行

alter table expense_records
  alter column visit_id drop not null;

alter table expense_records
  add column if not exists order_id uuid references orders(id);

alter table expense_records
  add column if not exists technician_id uuid references technicians(id);

do $$
begin
  alter table expense_records
    add constraint expense_records_order_id_required_check
    check (order_id is not null)
    not valid;
exception
  when duplicate_object then null;
end $$;

create index if not exists expense_records_order_id_idx
  on expense_records (order_id);

create index if not exists expense_records_technician_id_idx
  on expense_records (technician_id);

-- 历史 order_id 回填完成后手动执行：
-- alter table expense_records validate constraint expense_records_order_id_required_check;