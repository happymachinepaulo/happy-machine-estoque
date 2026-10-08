"""Initial migration to a NEW project only. Local SQLite is never modified."""
from common import *
import sqlite3, hashlib
from datetime import datetime, timezone, timedelta

load_env();assert_closed_signup();PRIVATE.mkdir(exist_ok=True)
project=os.environ['SUPABASE_URL'].rstrip('/')
state_path=PRIVATE/'migracao-online.json'
state=json.loads(state_path.read_text()) if state_path.exists() else None
if state and state['project']!=project:raise SystemExit('A migração existente pertence a outro projeto. Não misturar destinos.')
if not state:
    if any(all_rows(t) for t in ('products','photos','movements')):raise SystemExit('O projeto deve estar vazio para a migração inicial.')
    snapshot=PRIVATE/f'estoque_migracao_{datetime.now():%Y%m%d_%H%M%S}.db'
    with sqlite3.connect(ROOT/'local/dados/estoque.db') as src,sqlite3.connect(snapshot) as dst:src.backup(dst)
    state={'project':project,'snapshot':str(snapshot),'status':'in_progress'}
    state_path.write_text(json.dumps(state,indent=2),encoding='utf-8')
if state['status']=='complete':raise SystemExit('Migração já concluída; não sobrescrever alterações online.')
snapshot=Path(state['snapshot']);c=sqlite3.connect(snapshot);c.row_factory=sqlite3.Row
assert c.execute('pragma integrity_check').fetchone()[0]=='ok'
assert not c.execute('pragma foreign_key_check').fetchall()
def stamp(value):
    d=datetime.fromisoformat(value)
    if not d.tzinfo:d=d.replace(tzinfo=timezone(timedelta(hours=-3)))
    return d.isoformat()
def rows(table):
    out=[]
    for r in c.execute('select * from '+table+' order by id'):
        x=dict(r)
        if table=='photos':
            blob=x.pop('data');digest=hashlib.sha256(blob).hexdigest();suffix={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif'}.get(x['mime'],'.bin')
            x['storage_path']=f"migration/{x['id']}-{digest}{suffix}"
            remote('/storage/v1/object/stock-photos/'+x['storage_path'],'POST',blob,headers={'Content-Type':x['mime'],'x-upsert':'true'})
        for k in ('created_at','updated_at'):
            if x.get(k):x[k]=stamp(x[k])
        out.append(x)
    return out
summary={};expected={}
for table in ('products','photos','movements','audit_log'):
    data=rows(table);expected[table]=data
    for start in range(0,len(data),100):
        remote('/rest/v1/'+table+'?on_conflict=id','POST',data[start:start+100],headers={'Prefer':'resolution=merge-duplicates,return=minimal'})
    summary[table]=len(data);print(f'{table}: {len(data)} registros migrados.',flush=True)
remote('/rest/v1/rpc/reset_stock_sequences','POST',{})
for table in expected:
    actual=all_rows(table)
    assert len(actual)==len(expected[table]),f'Total divergente: {table}'
    lookup={r['id']:r for r in actual}
    for e in expected[table]:
        a=lookup[e['id']]
        for key,value in e.items():
            if key.endswith('_at'):assert datetime.fromisoformat(a[key].replace('Z','+00:00'))==datetime.fromisoformat(value)
            else:assert a[key]==value,f'Campo divergente: {table}/{e["id"]}/{key}'
summary['confirmed_units']=sum(r['quantity'] for r in expected['products'] if r['review_status']=='confirmado')
remote('/rest/v1/migration_runs','POST',{'id':'sqlite-initial-v1','summary':summary})
state.update(status='complete',summary=summary,completed_at=datetime.now(timezone.utc).isoformat())
state_path.write_text(json.dumps(state,indent=2),encoding='utf-8');c.close()
print('Migração verificada campo a campo. Banco local e fotos originais preservados.')
