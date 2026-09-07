-- 独立完工验收单：不关联 orders、stores、technicians 或其他现有业务表。
create table if not exists acceptance_forms (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  filled_pdf_path text not null,
  signed_pdf_path text,
  status text not null default 'draft' check (status in ('draft', 'pending_signature', 'signed')),
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table acceptance_forms drop column if exists template_name;

create index if not exists acceptance_forms_token_idx on acceptance_forms (token);
create index if not exists acceptance_forms_status_idx on acceptance_forms (status);

alter table acceptance_forms enable row level security;

do $$
begin
  create policy "authenticated users can manage acceptance forms"
    on acceptance_forms
    for all
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');
exception
  when duplicate_object then null;
end $$;

-- 私有 bucket。API 使用 server-only service role 读写，不向签字方暴露 Storage URL。
insert into storage.buckets (id, name, public)
values ('acceptance-forms', 'acceptance-forms', false)
on conflict (id) do update set public = false;