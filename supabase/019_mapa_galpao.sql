-- 019 · Mapa do galpão: em qual estante (A–K) cada peça fica guardada.
-- Seguro para rodar mais de uma vez. Não altera quantidades.
-- A distribuição inicial abaixo foi feita a partir das fotos de 05/11/2026 e só preenche
-- as peças que ainda estão sem estante. Depois é só trocar pelo site (ficha da peça → Estante).
begin;

alter table public.products add column if not exists location text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_location_chk') then
    alter table public.products add constraint products_location_chk check (location in ('','A','B','C','D','E','F','G','H','I','J','K'));
  end if;
end $$;
create index if not exists products_location_idx on public.products (location);

-- A Placas · B Fontes · C TI · D Visores/câmeras · E Pagamento · F Iluminação
-- G Rede/DVR · H Alvenaria (caixas, telas, impressoras) · I Contadoras · J Garra e mecânica · K Cabos (entrada)
update public.products set location='A' where location='' and id in (45,127,128,159,194,195,196,197,198,199,261,262,263,264,265);
update public.products set location='B' where location='' and id in (24,68,87,121,157,160,245,246);
update public.products set location='C' where location='' and id in (3,4,5,6,8,9,93,114,118,122,231,235,238);
update public.products set location='D' where location='' and id in (10,69,70,71,234);
update public.products set location='E' where location='' and id in (41,44,151,215,217);
update public.products set location='F' where location='' and id in (1,2,29,124,125,126,165,172,191,229);
update public.products set location='G' where location='' and id in (11,12,13,14,15,16,17,18,19,20,21,22,23,25,26,27);
update public.products set location='H' where location='' and id in (7,47,92,168,185,187,211,237,239,240,241,242,247);
update public.products set location='I' where location='' and id in (166,177);
update public.products set location='J' where location='' and id in (43,48,49,50,53,54,55,56,101,102,103,104,105,106,107,108,109,110,111,150,155,156,169,179,180,225,227,249,251,253,254,255,256,257,258,260);
update public.products set location='K' where location='' and id in (228,233,243,244,248);

insert into public.audit_log(action,after_data) values('migration_019','Mapa do galpão: coluna location e distribuição inicial');
commit;
