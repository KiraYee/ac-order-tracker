delete from acceptance_forms;

alter table acceptance_forms
  add column if not exists order_id uuid references orders(id);

alter table acceptance_forms
  alter column order_id set not null;

create index if not exists acceptance_forms_order_id_idx
  on acceptance_forms (order_id);