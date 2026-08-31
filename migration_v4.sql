-- 第四轮：城市/甲方/跟单人/投保/施工单/验收/统一报价（数量×单价）/师傅工种
-- 在 Supabase SQL Editor 执行。可重复执行。

-- ① 甲方公司
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table clients enable row level security;
do $$ begin
  create policy "team can access clients" on clients
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;

insert into clients (name)
select '孟董'
where not exists (select 1 from clients where name = '孟董');

-- ② 内部员工（跟单人）
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table employees enable row level security;
do $$ begin
  create policy "team can access employees" on employees
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;

-- ③ 工单新字段
alter table orders add column if not exists city text;
alter table orders add column if not exists client_id uuid references clients(id);
alter table orders add column if not exists follower_id uuid references employees(id);

-- 投保：enabled = 有/无；type = public（公众责任险）| accident（意外险）；同一单只能一种
alter table orders add column if not exists insurance_enabled boolean not null default false;
alter table orders add column if not exists insurance_type text;
alter table orders add column if not exists insurance_amount numeric;

-- 施工单：待上门及之后才在界面出现
alter table orders add column if not exists need_work_order boolean not null default false;
alter table orders add column if not exists work_order_status text;

-- 验收照片（已完成后填写）：验工单、清洗前后对比
alter table orders add column if not exists inspection_photo_url text;
alter table orders add column if not exists compare_photo_url text;

-- 报价：统一项目清单 [{label, qty, chargeUnit, costUnit}]
alter table orders add column if not exists quote_items jsonb default '[]'::jsonb;
alter table orders add column if not exists quote_updated_at timestamptz;
alter table orders add column if not exists quote_updated_by text;

-- 师傅费用是否已结（财务「师傅费用结算」用；上门级 technician_paid 仍保留作历史）
alter table orders add column if not exists technician_settled boolean not null default false;
alter table orders add column if not exists technician_settled_at timestamptz;

-- ④ 师傅资源能力，例如 ["空调工","电工"]
alter table technicians add column if not exists skills text[] default '{}';

-- ⑤ 常用项目改为同一项目两个单价（旧的 amount/kind 仍保留，不删数据）
alter table fee_presets add column if not exists charge_unit numeric;
alter table fee_presets add column if not exists cost_unit numeric;

update fee_presets
set charge_unit = amount
where kind = 'charge' and charge_unit is null;

update fee_presets
set cost_unit = amount
where kind = 'cost' and cost_unit is null;

-- ⑥ 把已付清的旧上门成本，回填到工单「师傅已结」
update orders o
set technician_settled = true,
    technician_settled_at = now()
where technician_settled = false
  and exists (select 1 from visits v where v.order_id = o.id)
  and not exists (
    select 1 from visits v
    where v.order_id = o.id
      and coalesce(v.technician_paid, false) = false
      and coalesce((
        select sum(coalesce((elem->>'amount')::numeric, 0))
        from jsonb_array_elements(coalesce(v.cost_items, '[]'::jsonb)) elem
      ), 0) > 0
  );
