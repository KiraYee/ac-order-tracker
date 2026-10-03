-- historical_store_link_preview.sql
-- 只读预览：本文件不执行任何 UPDATE / INSERT。

-- 1. store_id 为空，但城市、品牌、商场均已填写的订单。
select
  o.id as order_id,
  o.ticket_no,
  o.city,
  o.brand,
  o.mall,
  o.store_id
from orders o
where o.store_id is null
  and nullif(trim(o.city), '') is not null
  and nullif(trim(o.brand), '') is not null
  and nullif(trim(o.mall), '') is not null
order by o.city, o.brand, o.mall, o.report_time;

-- 2. 已关联门店，但门店身份与订单文本字段不一致的订单。
select
  o.id as order_id,
  o.ticket_no,
  o.store_id,
  o.city as order_city,
  s.city as store_city,
  o.brand as order_brand,
  s.brand as store_brand,
  o.mall as order_mall,
  s.mall as store_mall,
  s.store_name
from orders o
join stores s on s.id = o.store_id
where o.city is distinct from s.city
   or o.brand is distinct from s.brand
   or o.mall is distinct from s.mall
order by o.city, o.brand, o.mall, o.report_time;

-- 3. 汇总统计。
select
  count(*) filter (
    where o.store_id is null
      and nullif(trim(o.city), '') is not null
      and nullif(trim(o.brand), '') is not null
      and nullif(trim(o.mall), '') is not null
  ) as missing_store_id_with_complete_identity,
  count(*) filter (
    where o.store_id is not null
      and s.id is not null
      and (
        o.city is distinct from s.city
        or o.brand is distinct from s.brand
        or o.mall is distinct from s.mall
      )
  ) as mismatched_store_identity
from orders o
left join stores s on s.id = o.store_id;