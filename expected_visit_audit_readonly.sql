-- 只读审计：已有 visit，但订单预计上门时间早于最近一次 visit。
-- 本文件只包含 SELECT，不会修改任何数据。

select
  o.id as order_id,
  o.ticket_no,
  o.city,
  o.mall,
  o.expected_visit_time,
  o.expected_visit_pending,
  latest.visit_id as latest_visit_id,
  latest.latest_visit_time,
  latest.latest_visit_created_at,
  latest.master as latest_visit_master,
  (latest.latest_visit_time - o.expected_visit_time) as stale_by
from orders o
join lateral (
  select
    v.id as visit_id,
    v.visit_time as latest_visit_time,
    v.created_at as latest_visit_created_at,
    v.master
  from visits v
  where v.order_id = o.id
  order by v.visit_time desc nulls last, v.created_at desc nulls last
  limit 1
) latest on true
where o.expected_visit_time is not null
  and latest.latest_visit_time > o.expected_visit_time
order by stale_by desc;

select count(*) as stale_expected_visit_order_count
from orders o
join lateral (
  select max(v.visit_time) as latest_visit_time
  from visits v
  where v.order_id = o.id
) latest on true
where o.expected_visit_time is not null
  and latest.latest_visit_time > o.expected_visit_time;