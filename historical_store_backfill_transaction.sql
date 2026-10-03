-- historical_store_backfill_transaction.sql
-- 回填 6 条历史工单及 5 个新门店。
-- 请在 Supabase SQL Editor 中整体执行，不要拆分执行。
-- 本文件不会自动执行。

begin;

-- 前置保护：只允许处理预期的 6 条工单，且它们当前仍未关联门店。
do $$
declare
  actual_count integer;
begin
  select count(*)
    into actual_count
  from orders
  where ticket_no in (
    'KT202609191006',
    'KT202609222107',
    'KT202609270921',
    'KT202609291147',
    'KT202610031014',
    'KT202610031020'
  )
    and store_id is null;

  if actual_count <> 6 then
    raise exception '回填前置校验失败：预期 6 条未关联工单，实际为 %', actual_count;
  end if;

  if exists (
    select 1
    from orders
    where ticket_no = 'KT-0043'
      and store_id is null
  ) then
    raise exception '保护校验失败：KT-0043 不允许被本次脚本处理';
  end if;

  if exists (
    select 1
    from stores
    where (city, brand, mall) in (
      ('南京', 'DRUNK BAKER', '华贸中心'),
      ('常州', 'DRUNK BAKER', '万象城'),
      ('广州', '裕莲茶楼', '聚龙湾太古里'),
      ('上海', 'DRUNK BAKER', '长阳创谷'),
      ('上海', 'DRUNK BAKER', '田子坊')
    )
  ) then
    raise exception '回填前置校验失败：待创建身份已存在，请重新预览后再执行';
  end if;
end $$;

-- 创建 5 个门店。南京华贸中心的两条工单共用同一个 store_id。
insert into stores (id, city, brand, mall, store_name)
values
  ('8e629788-c5cb-4f42-ae6d-793d3d0cddb3', '南京', 'DRUNK BAKER', '华贸中心', 'DRUNK BAKER（南京华贸中心）'),
  ('1e1f63cb-91f2-42c7-8764-9988af42099e', '常州', 'DRUNK BAKER', '万象城', 'DRUNK BAKER（常州万象城）'),
  ('f5dcd8ab-22d7-450c-84c6-fc3bd03e6e3a', '广州', '裕莲茶楼', '聚龙湾太古里', '裕莲茶楼（广州聚龙湾太古里）'),
  ('f49a4075-bfc5-4754-b7b9-29fa750c9e81', '上海', 'DRUNK BAKER', '长阳创谷', 'DRUNK BAKER（上海长阳创谷）'),
  ('8125851c-a851-4fa6-bd98-c1e13b56f41a', '上海', 'DRUNK BAKER', '田子坊', 'DRUNK BAKER（上海田子坊）');

-- 只更新这 6 条明确指定的工单。
update orders
set store_id = case ticket_no
  when 'KT202609191006' then '8e629788-c5cb-4f42-ae6d-793d3d0cddb3'::uuid
  when 'KT202609222107' then '1e1f63cb-91f2-42c7-8764-9988af42099e'::uuid
  when 'KT202609270921' then '8e629788-c5cb-4f42-ae6d-793d3d0cddb3'::uuid
  when 'KT202609291147' then 'f5dcd8ab-22d7-450c-84c6-fc3bd03e6e3a'::uuid
  when 'KT202610031014' then 'f49a4075-bfc5-4754-b7b9-29fa750c9e81'::uuid
  when 'KT202610031020' then '8125851c-a851-4fa6-bd98-c1e13b56f41a'::uuid
end
where ticket_no in (
  'KT202609191006',
  'KT202609222107',
  'KT202609270921',
  'KT202609291147',
  'KT202610031014',
  'KT202610031020'
)
  and store_id is null;

-- 最终校验失败时让当前事务处于异常状态，整体不会提交。
do $$
declare
  linked_count integer;
  missing_count integer;
begin
  select count(*) into linked_count
  from orders
  where ticket_no in (
    'KT202609191006',
    'KT202609222107',
    'KT202609270921',
    'KT202609291147',
    'KT202610031014',
    'KT202610031020'
  )
    and store_id is not null;

  select count(*) into missing_count
  from orders
  where store_id is null
    and nullif(trim(city), '') is not null
    and nullif(trim(brand), '') is not null
    and nullif(trim(mall), '') is not null;

  if linked_count <> 6 then
    raise exception '回填结果校验失败：目标工单已关联 % 条，预期 6 条', linked_count;
  end if;

  if missing_count <> 0 then
    raise exception '回填结果校验失败：仍有 % 条完整身份工单未关联门店', missing_count;
  end if;
end $$;

commit;

-- 执行成功后可单独运行以下只读查询核对结果：
select
  o.ticket_no,
  o.store_id,
  s.store_name
from orders o
join stores s on s.id = o.store_id
where o.ticket_no in (
  'KT202609191006',
  'KT202609222107',
  'KT202609270921',
  'KT202609291147',
  'KT202610031014',
  'KT202610031020'
)
order by o.ticket_no;