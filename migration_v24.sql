-- 不需要验收单：兼容旧工单，旧数据默认视为需要验收资料
alter table orders
  add column if not exists no_acceptance_required boolean not null default false,
  add column if not exists no_acceptance_reason text not null default '',
  add column if not exists no_acceptance_by text,
  add column if not exists no_acceptance_at timestamptz;