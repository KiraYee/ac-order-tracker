-- technician_fee_split_audit_readonly.sql
-- 只读审计：不会写入、更新或删除任何数据。
-- 统计范围：expense_records.type = 'technician_fee'。

-- 1. 师傅费用中 technician_id 为空的记录数量。
select
  count(*) as technician_fee_without_technician_id_count
from expense_records e
where e.type = 'technician_fee'
  and e.technician_id is null;

-- 2. 同一订单下同时存在多个不同 technician_id 的订单数量。
--    technician_id 为空的历史费用不计入“多个师傅”判断，另见第 4 个明细查询。
select
  count(*) as orders_with_multiple_technicians_count
from (
  select e.order_id
  from expense_records e
  where e.type = 'technician_fee'
    and e.order_id is not null
    and e.technician_id is not null
  group by e.order_id
  having count(distinct e.technician_id) > 1
) multi_technician_orders;

-- 3. 多师傅订单明细：每个订单下有哪些师傅、金额和结算情况。
select
  e.order_id,
  o.ticket_no,
  string_agg(distinct coalesce(t.name, e.technician_id::text), '、' order by coalesce(t.name, e.technician_id::text)) as technician_names,
  count(distinct e.technician_id) as technician_count,
  count(*) as technician_fee_record_count,
  coalesce(sum(e.amount), 0) as total_amount,
  coalesce(sum(e.amount) filter (where e.is_settled = true), 0) as settled_amount,
  coalesce(sum(e.amount) filter (where e.is_settled is distinct from true), 0) as unsettled_amount
from expense_records e
join orders o on o.id = e.order_id
left join technicians t on t.id = e.technician_id
where e.type = 'technician_fee'
  and e.order_id is not null
  and e.technician_id is not null
group by e.order_id, o.ticket_no
having count(distinct e.technician_id) > 1
order by o.ticket_no;

-- 4. technician_id 为空的费用明细，便于逐条核对是否只能依据 visits.master 补充关联。
select
  e.id as expense_record_id,
  e.order_id,
  o.ticket_no,
  e.visit_id,
  v.visit_time,
  v.master as visit_master,
  e.label,
  e.amount,
  e.payment_method,
  e.is_settled,
  e.settled_at,
  e.created_at
from expense_records e
left join orders o on o.id = e.order_id
left join visits v on v.id = e.visit_id
where e.type = 'technician_fee'
  and e.technician_id is null
order by e.created_at, e.id;