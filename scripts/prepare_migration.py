"""Prepare executable SQL + private Storage objects from a consistent live snapshot."""
from pathlib import Path
from datetime import datetime,timezone,timedelta
import sqlite3,json,hashlib,zipfile

root=Path(__file__).resolve().parents[1]
out=root/'migration';out.mkdir(exist_ok=True)
photos_dir=out/'photos'/'migration';photos_dir.mkdir(parents=True,exist_ok=True)
private=root/'.private';private.mkdir(exist_ok=True)
snapshot=private/f'preparado_supabase_{datetime.now():%Y%m%d_%H%M%S}.db'
with sqlite3.connect(root/'local/dados/estoque.db') as src,sqlite3.connect(snapshot) as dst:src.backup(dst)
c=sqlite3.connect(snapshot);c.row_factory=sqlite3.Row
assert c.execute('pragma integrity_check').fetchone()[0]=='ok'
assert not c.execute('pragma foreign_key_check').fetchall()
def timestamp(s):
    d=datetime.fromisoformat(s)
    return (d if d.tzinfo else d.replace(tzinfo=timezone(timedelta(hours=-3)))).isoformat()
def literal(v):
    if v is None:return 'NULL'
    if isinstance(v,(int,float)):return str(v)
    if '\0' in str(v):raise ValueError('Texto com byte nulo não pode ser transferido')
    return "'"+str(v).replace("'","''")+"'"
manifest={'prepared_at':datetime.now(timezone.utc).isoformat(),'snapshot_sha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'tables':{},'photos':[],'confirmed_units':0,'pending_products':0}
lines=[
 '-- Dados preparados do banco atual Happy Machine. Não executar em projeto em uso.',
 '-- Fotos binárias estão em migration/photos; este SQL contém metadados e caminhos privados.',
 'begin;', 'set local standard_conforming_strings=on;',
 "do $$ begin if exists(select 1 from public.products) or exists(select 1 from public.photos) or exists(select 1 from public.movements) or exists(select 1 from public.audit_log) then raise exception 'Destino não vazio: não sobrescrever o estoque online'; end if; end $$;"
]
metadata={}
for table in ['products','photos','movements','audit_log']:
    rows=[]
    for r in c.execute('select * from '+table+' order by id'):
        item=dict(r)
        if table=='photos':
            data=item.pop('data');digest=hashlib.sha256(data).hexdigest()
            suffix={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif'}.get(item['mime'],'.bin')
            name=f"{item['id']}-{digest}{suffix}"
            item['storage_path']='migration/'+name;(photos_dir/name).write_bytes(data)
            manifest['photos'].append({'id':item['id'],'path':item['storage_path'],'mime':item['mime'],'sha256':digest,'bytes':len(data)})
        for field in ['created_at','updated_at']:
            if item.get(field):item[field]=timestamp(item[field])
        rows.append(item)
    metadata[table]=rows;manifest['tables'][table]=len(rows)
    if not rows:continue
    cols=list(rows[0]);columns=','.join('"'+col+'"' for col in cols)
    for start in range(0,len(rows),50):
        values=[ '('+','.join(literal(r[col]) for col in cols)+')' for r in rows[start:start+50]]
        lines.append('insert into public.'+table+' ('+columns+') values\n'+',\n'.join(values)+';')
manifest['confirmed_units']=sum(p['quantity'] for p in metadata['products'] if p['review_status']=='confirmado')
manifest['pending_products']=sum(p['review_status']=='pendente' for p in metadata['products'])
lines += ["select public.reset_stock_sequences();", "insert into public.migration_runs(id,summary) values('sqlite-prepared-v1',"+literal(json.dumps({'tables':manifest['tables'],'snapshot_sha256':manifest['snapshot_sha256']}))+"::jsonb);",'commit;']
(root/'supabase/002_dados.sql').write_text('\n\n'.join(lines)+'\n',encoding='utf-8')
(out/'metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
archive=out/'fotos_storage.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for ph in manifest['photos']:z.write(out/'photos'/ph['path'],ph['path'])
c.close()
print(json.dumps({k:v for k,v in manifest.items() if k!='photos'},ensure_ascii=False))
