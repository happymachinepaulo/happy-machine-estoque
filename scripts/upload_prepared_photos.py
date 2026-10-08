"""Upload objects after executing 002_dados.sql; metadata must match the prepared snapshot."""
from common import *
import hashlib
import zipfile
load_env();assert_closed_signup()
out=ROOT/'migration';manifest=json.loads((out/'manifest.json').read_text(encoding='utf-8'))
prepared=json.loads((out/'metadata.json').read_text(encoding='utf-8'))
for table,expected in prepared.items():
    actual=all_rows(table);lookup={r['id']:r for r in actual}
    if len(actual)!=len(expected):raise SystemExit(f'Execute 002_dados.sql antes do upload. Total de {table} não corresponde.')
    for item in expected:
        row=lookup.get(item['id'])
        if not row or any(row[k]!=v for k,v in item.items() if not k.endswith('_at')):raise SystemExit(f'O destino não corresponde ao snapshot: {table}/{item["id"]}. Não continuar.')
for i,photo in enumerate(manifest['photos'],1):
    path=out/'photos'/photo['path']
    if path.exists():blob=path.read_bytes()
    else:
        with zipfile.ZipFile(out/'fotos_storage.zip') as archive:blob=archive.read(photo['path'])
    if hashlib.sha256(blob).hexdigest()!=photo['sha256']:raise SystemExit('Foto preparada foi alterada; interrompendo.')
    remote('/storage/v1/object/stock-photos/'+photo['path'],'POST',blob,headers={'Content-Type':photo['mime'],'x-upsert':'true'})
    if i%25==0 or i==len(manifest['photos']):print(f'{i}/{len(manifest["photos"])} fotos privadas transferidas.',flush=True)
print('Upload concluído. Contagens e revisões correspondem ao SQL preparado.')
