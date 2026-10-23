-- 017 · Desempenho. Seguro para rodar mais de uma vez; não altera dados.
-- 1) miniaturas  2) índices  3) políticas RLS avaliadas uma vez por consulta (e não uma vez por linha)
alter table public.photos add column if not exists thumb_path text;

create index if not exists products_name_idx      on public.products (name, id);
create index if not exists products_review_idx    on public.products (review_status);
create index if not exists photos_review_idx      on public.photos (review_status, id);
create index if not exists photos_product_primary on public.photos (product_id, is_primary desc, id) where review_status = 'confirmada';
create index if not exists movements_created_idx  on public.movements (id desc);
create index if not exists movements_kind_idx     on public.movements (kind, id desc);
create index if not exists repairs_open_idx       on public.repairs (created_at desc, id desc) where archived_at is null;
create index if not exists email_login_sessions_user_idx on public.email_login_sessions (user_id, expires_at);
create index if not exists audit_log_actor_idx    on public.audit_log (actor_id);
create index if not exists movements_actor_idx    on public.movements (actor_id);
create index if not exists repairs_actor_idx      on public.repairs (actor_id);

-- Mesmas regras de acesso de antes; só trocam stock_access(...) por (select stock_access(...)),
-- que o Postgres calcula uma única vez por consulta em vez de uma vez por linha.
do $$ declare t text; begin
 foreach t in array array['products','photos','movements','audit_log','migration_runs'] loop
  execute format('drop policy if exists stock_read on public.%I',t);
  execute format('drop policy if exists require_mfa on public.%I',t);
  execute format('create policy stock_read on public.%I for select to authenticated using ((select public.stock_access(false)))',t);
  execute format('create policy require_mfa on public.%I as restrictive for all to authenticated using ((select public.stock_access(false))) with check ((select public.stock_access(false)))',t);
 end loop;
end $$;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
 using ((select public.stock_access(false)) and (id = (select auth.uid()) or (select public.stock_access(true))));
drop policy if exists repairs_read on public.repairs;
create policy repairs_read on public.repairs for select to authenticated using ((select public.stock_access(false)));

drop policy if exists stock_photos_read on storage.objects;
create policy stock_photos_read on storage.objects for select to authenticated using (bucket_id = 'stock-photos' and (select public.stock_access(false)));
drop policy if exists stock_photos_upload on storage.objects;
create policy stock_photos_upload on storage.objects for insert to authenticated with check (bucket_id = 'stock-photos' and (select public.stock_access(false)));

analyze public.products; analyze public.photos; analyze public.movements;
insert into public.migration_runs(id, summary) values ('desempenho-20261023', '{"feature":"thumb_path+indices+rls_initplan","stock_quantity_changes":0}'::jsonb) on conflict (id) do nothing;
notify pgrst, 'reload schema';
