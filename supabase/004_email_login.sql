-- Atualização de uma instalação existente. Não altera produtos ou quantidades.
begin;
create table if not exists public.email_login_challenges (
 token_hash text primary key check(length(token_hash)=64),
 user_id uuid not null references auth.users(id) on delete cascade,
 email text not null, created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',
 attempts integer not null default 0, completed boolean not null default false
);
create index if not exists email_login_user_idx on public.email_login_challenges(user_id,created_at);
create table if not exists public.email_login_sessions (
 session_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '8 hours'
);
alter table public.email_login_challenges enable row level security;
alter table public.email_login_sessions enable row level security;
revoke all on public.email_login_challenges,public.email_login_sessions from public,anon,authenticated;
grant all on public.email_login_challenges,public.email_login_sessions to service_role;

-- Somente a API pode emitir um desafio após validar a senha, ou confirmar a sessão.
create or replace function public.email_login_command(action text, secret_hash text,
 uid uuid default null, email_address text default null, sid uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.email_login_challenges;
begin
 if action='begin' then
  if length(secret_hash)<>64 or uid is null then raise exception 'Desafio inválido'; end if;
  perform 1 from public.profiles where id=uid and active for update;
  if not found then raise exception 'Conta sem acesso'; end if;
  if exists(select 1 from public.email_login_challenges where user_id=uid and created_at>now()-interval '60 seconds') then
   raise exception 'Aguarde 60 segundos antes de solicitar outro código';
  end if;
  delete from public.email_login_challenges where expires_at<now();
  delete from public.email_login_sessions where expires_at<now();
  insert into public.email_login_challenges(token_hash,user_id,email) values(secret_hash,uid,email_address);
  return jsonb_build_object('ok',true);
 end if;
 select * into c from public.email_login_challenges where token_hash=secret_hash for update;
 if not found or c.completed or c.expires_at<=now() or (action='attempt' and c.attempts>=5) then
  raise exception 'Código expirado ou limite de tentativas atingido. Entre novamente.';
 end if;
 if action='attempt' then
  update public.email_login_challenges set attempts=attempts+1 where token_hash=secret_hash;
  return jsonb_build_object('user_id',c.user_id,'email',c.email);
 elsif action='complete' then
  if c.user_id<>uid or sid is null then raise exception 'Sessão inválida'; end if;
  if not exists(select 1 from public.profiles where id=uid and active) then raise exception 'Conta sem acesso'; end if;
  update public.email_login_challenges set completed=true where token_hash=secret_hash;
  insert into public.email_login_sessions(session_id,user_id) values(sid,uid);
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Operação inválida';
end $$;
revoke all on function public.email_login_command(text,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.email_login_command(text,text,uuid,text,uuid) to service_role;

-- JWT emitido apenas por senha ou por OTP direto não recebe acesso ao estoque.
create or replace function public.stock_access(admin_only boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.email_login_sessions s
  join public.profiles p on p.id=s.user_id
  where s.session_id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid()
  and s.expires_at>now() and p.active and (not admin_only or p.role='admin'));
$$;
revoke all on function public.stock_access(boolean) from public;
grant execute on function public.stock_access(boolean) to authenticated;
do $$ declare t text; begin
 foreach t in array array['products','photos','movements','audit_log','migration_runs'] loop
 execute format('drop policy if exists require_mfa on public.%I',t);
 execute format('create policy require_mfa on public.%I as restrictive for all to authenticated using (public.stock_access(false)) with check (public.stock_access(false))',t);
 end loop;
end $$;
commit;
