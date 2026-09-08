-- 只读排查：上门记录费用异常/可能丢失线索
-- 本文件只包含 SELECT，不会修改任何数据。
-- 说明：如果旧费用被先删除后重插，原 expense_records 行的 id、created_at
-- 以及金额都没有审计表可追溯，因此数据库本身通常无法精确证明“哪一条”被删。

-- 1. 精确检查：已报销的垫付是否仍有对应费用记录。
--    若返回记录，说明 advances 仍保留但费用记录已丢失。
select
  a.id as advance_id,
  a.expense_record_id,
  a.order_id,
  a.employee_name,
  a.amount,
  a.reimbursed,
  a.reimbursed_at,
  a.created_at
from advances a
left join expense_records er on er.id = a.expense_record_id
where a.expense_record_id is not null
  and er.id is null
order by a.created_at desc;

-- 2. 检查 visit 是否存在 expense_records，但订单/visit 两层关联数量不一致。
--    正常情况下，visit_id 关联的费用应能被 visits 连接到。
select
  v.id as visit_id,
  v.order_id,
  v.visit_time,
  v.created_at as visit_created_at,
  count(er.id) as expense_count
from visits v
left join expense_records er on er.visit_id = v.id
group by v.id, v.order_id, v.visit_time, v.updated_at
order by v.created_at desc nulls last;

-- 3. 线索检查：visit 创建后目前没有费用。
--    当前 visits 表未确认有 updated_at 审计字段，因此这里不能精确定位“编辑后丢失”；
--    仅用于先筛出需要结合业务记录人工核对的 visit。
select
  v.id as visit_id,
  v.order_id,
  v.visit_time,
  v.created_at as visit_created_at,
  count(er.id) as current_expense_count
from visits v
left join expense_records er on er.visit_id = v.id
where v.created_at is not null
group by v.id, v.order_id, v.visit_time, v.updated_at
having count(er.id) = 0
order by v.created_at desc;

-- 4. 按订单汇总当前 visit 费用，便于和财务/历史截图人工比对。
select
  o.id as order_id,
  o.ticket_no,
  v.id as visit_id,
  v.visit_time,
  count(er.id) as expense_count,
  coalesce(sum(er.amount), 0) as expense_total,
  count(er.id) filter (where er.is_settled = true) as settled_expense_count
from orders o
join visits v on v.order_id = o.id
left join expense_records er on er.visit_id = v.id
group by o.id, o.ticket_no, v.id, v.visit_time
order by v.visit_time desc;