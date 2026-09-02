-- expense_records_backfill_preview.sql
-- 只读预览：不会写入任何表

-- 预览将由 visits.cost_items 生成的师傅费用记录数量
select
  count(*) as expense_record_count,
  count(distinct v.id) as visit_count
from visits v
cross join lateral jsonb_array_elements(coalesce(v.cost_items, '[]'::jsonb)) as item
where jsonb_typeof(v.cost_items) = 'array';

-- 按 visit 查看预览明细
select
  v.id as visit_id,
  v.visit_time,
  item.ordinality::integer as item_index,
  item.value->>'label' as label,
  case
    when item.value ? 'qty' and nullif(item.value->>'qty', '') is not null
      then (item.value->>'qty')::numeric
    else 1
  end as qty,
  case
    when item.value ? 'unitPrice' and nullif(item.value->>'unitPrice', '') is not null
      then (item.value->>'unitPrice')::numeric
    else coalesce(nullif(item.value->>'amount', '')::numeric, 0)
  end as unit_price,
  coalesce(
    nullif(item.value->>'amount', '')::numeric,
    (
      case
        when item.value ? 'qty' and nullif(item.value->>'qty', '') is not null
          then (item.value->>'qty')::numeric
        else 1
      end
    ) * coalesce(nullif(item.value->>'unitPrice', '')::numeric, 0)
  ) as amount,
  'technician_fee' as type,
  'monthly_settlement' as payment_method,
  false as is_settled,
  '历史 cost_items 回填' as notes
from visits v
cross join lateral jsonb_array_elements(coalesce(v.cost_items, '[]'::jsonb)) with ordinality as item(value, ordinality)
where jsonb_typeof(v.cost_items) = 'array'
order by v.visit_time, v.id, item.ordinality;

-- 确认预览后，执行以下事务完成实际回填：
-- 注意：该脚本没有可靠的来源唯一键，不建议重复执行。
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
  'technician_fee',
  coalesce(item.value->>'label', '未命名费用'),
  case
    when item.value ? 'qty' and nullif(item.value->>'qty', '') is not null
      then (item.value->>'qty')::numeric
    else 1
  end,
  case
    when item.value ? 'unitPrice' and nullif(item.value->>'unitPrice', '') is not null
      then (item.value->>'unitPrice')::numeric
    else coalesce(nullif(item.value->>'amount', '')::numeric, 0)
  end,
  coalesce(
    nullif(item.value->>'amount', '')::numeric,
    (
      case
        when item.value ? 'qty' and nullif(item.value->>'qty', '') is not null
          then (item.value->>'qty')::numeric
        else 1
      end
    ) * coalesce(nullif(item.value->>'unitPrice', '')::numeric, 0)
  ),
  'monthly_settlement',
  null,
  false,
  null,
  '历史 cost_items 回填'
from visits v
cross join lateral jsonb_array_elements(coalesce(v.cost_items, '[]'::jsonb)) as item
where jsonb_typeof(v.cost_items) = 'array';

commit;