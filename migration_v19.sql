-- migration_v19.sql
-- 验收单照片改为 Supabase Storage 单图上传
-- 请手动在 Supabase SQL Editor 中执行；本文件不会自动执行

alter table orders add column if not exists acceptance_photo_url text;

insert into storage.buckets (id, name, public)
values ('acceptance-photos', 'acceptance-photos', true)
on conflict (id) do update set public = true;

do $$
begin
  create policy "authenticated users can read acceptance photos"
    on storage.objects for select
    using (bucket_id = 'acceptance-photos' and auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated users can upload acceptance photos"
    on storage.objects for insert
    with check (bucket_id = 'acceptance-photos' and auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated users can update acceptance photos"
    on storage.objects for update
    using (bucket_id = 'acceptance-photos' and auth.role() = 'authenticated')
    with check (bucket_id = 'acceptance-photos' and auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "authenticated users can delete acceptance photos"
    on storage.objects for delete
    using (bucket_id = 'acceptance-photos' and auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;