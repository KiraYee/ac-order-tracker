-- migration_v9.sql
-- 新增独立门店实体，并允许工单关联门店
-- 请手动在 Supabase SQL Editor 中执行；本文件不会自动执行

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  brand text not null,
  mall text not null,
  store_name text not null,
  address text,
  contact_name text,
  contact_phone text,
  special_requirements text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table stores enable row level security;

do $$
begin
  create policy "team can access stores"
    on stores
    for all
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');
exception
  when duplicate_object then null;
end $$;

create unique index if not exists stores_identity_unique_idx
  on stores (city, brand, mall, store_name);

create index if not exists stores_lookup_idx
  on stores (city, brand, mall, store_name);

alter table orders
  add column if not exists store_id uuid references stores(id);

create index if not exists orders_store_id_idx
  on orders (store_id);