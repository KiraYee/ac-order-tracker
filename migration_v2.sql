-- 在 Supabase 的 SQL Editor 里执行这份脚本，给数据库加上新功能需要的表和字段

-- 师傅名单：维护一份可复用的师傅名单，带电话
create table if not exists technicians (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);
alter table technicians enable row level security;
create policy "team can access technicians" on technicians
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 常用费用项目：比如"清洗 100 元"、"加制冷剂 200 元"，登记上门时可以直接点选，也可以新增/编辑
create table if not exists fee_presets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);
alter table fee_presets enable row level security;
create policy "team can access fee_presets" on fee_presets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- orders 表新增：关联工单、指派师傅
alter table orders add column if not exists related_order_id uuid references orders(id);
alter table orders add column if not exists assigned_technician_id uuid references technicians(id);

-- visits 表新增：本次上门的费用明细（JSON 数组，例如 [{"label":"清洗","amount":100}]）
alter table visits add column if not exists cost_items jsonb default '[]'::jsonb;
