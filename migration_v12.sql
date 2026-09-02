-- migration_v12.sql
-- 费用结算方式与垫付记录强关联
-- 请手动在 Supabase SQL Editor 中执行；本文件不会自动执行

-- payment_method 为 null 时表示“待定”，尚未决定结算方式。
alter table expense_records
  drop constraint if exists expense_records_advance_payer_check;

alter table expense_records
  alter column payment_method drop not null;

alter table expense_records
  drop constraint if exists expense_records_payment_method_check;

alter table expense_records
  add constraint expense_records_payment_method_check
  check (
    payment_method is null
    or payment_method in ('advance', 'monthly_settlement')
  );

alter table expense_records
  add constraint expense_records_advance_payer_check
  check (
    payment_method is distinct from 'advance'
    or nullif(trim(payer_name), '') is not null
  );

-- 自动生成的垫付记录与费用记录强关联，删除费用时级联删除垫付记录。
alter table advances
  add column if not exists expense_record_id uuid
  references expense_records(id) on delete cascade;

create index if not exists advances_expense_record_id_idx
  on advances (expense_record_id);