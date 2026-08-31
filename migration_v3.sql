-- 在 Supabase 的 SQL Editor 里执行。这份是第三轮功能迭代，建立在 migration_v2.sql 之上。

-- ① 师傅信息补充：城市、详细地址
alter table technicians add column if not exists city text;
alter table technicians add column if not exists address text;

-- ② 常用费用项目预设，区分"报价项目"和"成本项目"两类
alter table fee_presets add column if not exists kind text not null default 'charge';
-- kind 取值：'charge' = 跟甲方收费的预设项目，'cost' = 付给师傅的预设项目

-- ③ 上门记录：报价与成本彻底分开
-- 之前的 cost_items 字段含义不清，现在明确拆成两组：
alter table visits add column if not exists charge_items jsonb default '[]'::jsonb; -- 跟甲方收的钱，例如 [{"label":"清洗","amount":100}]
-- cost_items 字段沿用，明确含义为"付给师傅的钱"，不用改名，避免影响已有数据
alter table visits add column if not exists technician_paid boolean not null default false; -- 这次上门的师傅成本是否已经付给师傅
alter table visits add column if not exists technician_paid_at timestamptz;

-- ④ 工单：甲方结算状态
alter table orders add column if not exists client_settled boolean not null default false; -- 甲方是否已经把这笔钱结给我们
alter table orders add column if not exists client_settled_at timestamptz;

-- ⑤ 垫付报销：独立的一张表，不跟工单费用混在一起
create table if not exists advances (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,       -- 谁垫付的
  amount numeric not null default 0, -- 垫付了多少钱
  reason text,                       -- 垫付原因说明
  order_id uuid references orders(id), -- 可选：关联到某个具体工单
  reimbursed boolean not null default false, -- 是否已经报销给这位员工
  reimbursed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);
alter table advances enable row level security;
create policy "team can access advances" on advances
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 说明：
-- 1. 报价／成本合计、利润、"这个师傅一共挣了多少钱"这些都是从 visits 表的 charge_items / cost_items
--    实时汇总算出来的，不需要额外的字段去手动维护，避免数据对不上。
-- 2. "价格参考"功能直接查询所有历史 visits 里的 charge_items / cost_items，按项目名称模糊匹配，
--    不需要新建表。
