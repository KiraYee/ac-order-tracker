-- technician_name_consistency_readonly.sql
-- 只读审计：不会写入、更新或删除任何数据。

-- 1. visits 中 technician_id 为空但 master 非空的数量及姓名分布。
select
  count(*) as visits_without_technician_id_count,
  count(distinct nullif(trim(master), '')) as distinct_master_name_count
from visits
where technician_id is null
  and nullif(trim(master), '') is not null;

select
  trim(master) as master_name,
  count(*) as visit_count,
  min(visit_time) as first_visit_time,
  max(visit_time) as latest_visit_time
from visits
where technician_id is null
  and nullif(trim(master), '') is not null
group by trim(master)
order by visit_count desc, master_name;

-- 2. technician_id 有值但 master 与 technicians.name 不一致的数量及前 20 条。
select count(*) as visits_with_name_mismatch_count
from visits v
join technicians t on t.id = v.technician_id
where nullif(trim(v.master), '') is not null
  and trim(v.master) is distinct from trim(t.name);

select
  v.id as visit_id,
  v.order_id,
  o.ticket_no,
  v.visit_time,
  v.technician_id,
  t.name as current_technician_name,
  v.master as stored_master_name,
  v.master_phone,
  v.created_at
from visits v
join technicians t on t.id = v.technician_id
left join orders o on o.id = v.order_id
where nullif(trim(v.master), '') is not null
  and trim(v.master) is distinct from trim(t.name)
order by v.visit_time desc nulls last, v.created_at desc nulls last
limit 20;

-- 3. orders 当前负责师傅 ID 是否存在对应 technicians 记录。
select
  count(*) filter (where o.assigned_technician_id is not null) as orders_with_assigned_technician_id,
  count(*) filter (where o.assigned_technician_id is not null and t.id is null) as orders_with_missing_assigned_technician,
  count(*) filter (where o.assigned_technician_id is null) as orders_without_assigned_technician
from orders o
left join technicians t on t.id = o.assigned_technician_id;

-- 4. expense_records 是否存在姓名快照，以及其 technician_id 关联完整性。
select
  count(*) as technician_fee_record_count,
  count(*) filter (where e.technician_id is null) as technician_fee_without_technician_id_count,
  count(*) filter (where e.technician_id is not null and t.id is null) as technician_fee_with_missing_technician_count
from expense_records e
left join technicians t on t.id = e.technician_id
where e.type = 'technician_fee';

select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('orders', 'visits', 'expense_records')
  and (
    column_name ilike '%technician%'
    or column_name ilike '%master%'
    or column_name ilike '%name%'
    or column_name = 'payer_name'
  )
order by table_name, ordinal_position;