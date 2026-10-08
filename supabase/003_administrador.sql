-- Optional SQL alternative to scripts/bootstrap_admin.py.
-- First create the Auth user with the generated password using the admin API or dashboard.
-- Never insert plaintext passwords or invent password hashes in auth.users.
begin;
do $$ begin
 if not exists(select 1 from auth.users where lower(email)='happymachinepaulo@gmail.com') then
  raise exception 'Crie primeiro o usuário de autenticação happymachinepaulo@gmail.com';
 end if;
end $$;
insert into public.profiles(id,email,name,role,active)
select id,email,'Paulo','admin',true from auth.users where lower(email)='happymachinepaulo@gmail.com'
on conflict(id) do update set role='admin',active=true,name='Paulo';
commit;
