-- 只读预览：执行前先查看将被清理的孤儿费用
select er.*
from expense_records er
left join visits v on v.id = er.visit_id
where er.visit_id is not null
  and v.id is null;

-- 确认无误后手动执行以下清理语句；本文件不会自动执行
-- delete from expense_records er
-- where er.visit_id is not null
--   and not exists (select 1 from visits v where v.id = er.visit_id);