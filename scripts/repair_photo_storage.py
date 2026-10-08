"""Restore missing prepared image objects without changing stock or overwriting files."""
from common import *
import hashlib, zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed

def download(path):
    url=os.environ['SUPABASE_URL'].rstrip('/')+'/storage/v1/object/authenticated/stock-photos/'+urllib.parse.quote(path,safe='/')
    key=os.environ['SUPABASE_SERVICE_ROLE_KEY'];headers={'apikey':key}
    if key.count('.')==2:headers['Authorization']='Bearer '+key
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=60) as response:return response.read()
    except urllib.error.HTTPError as e:
        try:detail=json.loads(e.read())
        except Exception:detail={}
        if detail.get('code')=='NoSuchKey' or str(detail.get('statusCode'))=='404':return None
        raise RemoteError(e.code,'/storage/v1/object/authenticated/stock-photos') from None

def main():
    load_env()
    bucket=remote('/storage/v1/bucket/stock-photos')
    if bucket['public']:raise SystemExit('O bucket deve continuar privado.')
    folder=ROOT/'migration';manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    rows={row['id']:row for row in all_rows('photos')}
    eligible=[]
    for photo in manifest['photos']:
        row=rows.get(photo['id'])
        if row and row['storage_path']==photo['path'] and row['mime']==photo['mime']:eligible.append(photo)
    def restore(photo):
        current=download(photo['path'])
        if current is not None:
            if hashlib.sha256(current).hexdigest()!=photo['sha256']:raise SystemExit(f'Foto {photo["id"]} diferente no Storage: preservada, sem sobrescrever.')
            return 'existing'
        path=folder/'photos'/photo['path']
        if path.exists():blob=path.read_bytes()
        else:
            with zipfile.ZipFile(folder/'fotos_storage.zip') as archive:blob=archive.read(photo['path'])
        if hashlib.sha256(blob).hexdigest()!=photo['sha256']:raise SystemExit('Arquivo local alterado. Upload interrompido.')
        remote('/storage/v1/object/stock-photos/'+urllib.parse.quote(photo['path'],safe='/'),'POST',blob,headers={'Content-Type':photo['mime'],'x-upsert':'false'})
        stored=download(photo['path'])
        if stored is None or hashlib.sha256(stored).hexdigest()!=photo['sha256']:raise SystemExit(f'Falha ao verificar foto {photo["id"]}.')
        return 'restored'
    result={'restored':0,'existing':0,'skipped':len(manifest['photos'])-len(eligible),'verified':0,'private_bucket':True}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for future in as_completed([pool.submit(restore,p) for p in eligible]):
            result[future.result()]+=1;result['verified']+=1
            if result['verified']%25==0 or result['verified']==len(eligible):print(f'{result["verified"]}/{len(eligible)} fotos verificadas no Storage privado.',flush=True)
    (folder/'storage_repair_report.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result),flush=True)

if __name__=='__main__':main()
