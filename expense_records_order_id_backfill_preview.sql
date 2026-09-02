-- expense_records_order_id_backfill_preview.sql
-- 只读预览：不会写入任何表

-- 预览：确认将要回填的记录数量
select count(*) as records_to_backfill
from expense_records e
join visits v on v.id = e.visit_id
where e.order_id is null;

-- 预览：查看具体回填关系
select
  e.id as expense_record_id,
  e.visit_id,
  v.order_id,
  e.type,
  e.label,
  e.amount
from expense_records e
join visits v on v.id = e.visit_id
where e.order_id is null
order by e.created_at;

-- 实际回填语句（请确认预览结果后手动执行）
update expense_records e
set order_id = v.order_id
from visits v
where e.visit_id = v.id
  and e.order_id is null;