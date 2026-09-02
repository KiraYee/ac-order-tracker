-- insurance_single_visit_backfill_preview.sql
-- 只读预览：不会写入任何表
-- 默认建议：monthly_settlement / is_settled=false / payer_name=null

select
  count(*) as expense_record_count,
  count(distinct o.id) as order_count,
  count(distinct v.id) as visit_count
from orders o
join visits v on v.order_id = o.id
where coalesce(o.insurance_amount, 0) > 0
  and (
    select count(*) from visits v2 where v2.order_id = o.id
  ) = 1;

select
  o.id as order_id,
  o.ticket_no,
  o.store_id,
  o.insurance_amount,
  o.insurance_type,
  v.id as visit_id,
  v.visit_time,
  v.service_type,
  v.service_content,
  'insurance' as type,
  '保险费' as label,
  1 as qty,
  o.insurance_amount as unit_price,
  o.insurance_amount as amount,
  'monthly_settlement' as payment_method,
  null as payer_name,
  false as is_settled,
  null as settled_at,
  '历史订单保险费回填，具体付款方式和结算状态待确认' as notes
from orders o
join visits v on v.order_id = o.id
where coalesce(o.insurance_amount, 0) > 0
  and (
    select count(*) from visits v2 where v2.order_id = o.id
  ) = 1
order by o.report_time, o.ticket_no;

-- 确认默认值和预览后，执行以下事务完成实际回填：
begin;

insert into expense_records (
  visit_id,
  type,
  label,
  qty,
  unit_price,
  amount,
  payment_method,
  payer_name,
  is_settled,
  settled_at,
  notes
)
select
  v.id,
  'insurance',
  '保险费',
  1,
  o.insurance_amount,
  o.insurance_amount,
  'monthly_settlement',
  null,
  false,
  null,
  '历史订单保险费回填，具体付款方式和结算状态待确认'
from orders o
join visits v on v.order_id = o.id
where coalesce(o.insurance_amount, 0) > 0
  and (
    select count(*) from visits v2 where v2.order_id = o.id
  ) = 1;

commit;