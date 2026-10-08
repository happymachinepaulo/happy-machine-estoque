from pathlib import Path
import zipfile,hashlib,json
root=Path(__file__).resolve().parents[1]
delivery=root/'entrega'
delivery.mkdir(exist_ok=True)
output=delivery/'HappyMachine_Online_Vercel_Supabase.zip'
prefix=root.name+'/'
files=[]
for p in root.rglob('*'):
    if not p.is_file():continue
    relative=p.relative_to(root)
    if relative.parts[0] not in ('public','api','scripts','supabase','tests','migration') and str(relative) not in ('vercel.json','.gitignore','.gitattributes','.vercelignore','.env.example','README.md','DEPLOY.md'):continue
    if p.name=='package_report.json':continue
    if any(part in ('__pycache__','_deps','.vercel') for part in relative.parts):continue
    if relative.parts[0]=='tests' and p.suffix not in ('.py','.cjs'):continue
    if relative.parts[:2]==('migration','photos'):continue
    if p.suffix in ('.db','.pyc') or (p.name.startswith('.env') and p.name!='.env.example'):continue
    files.append(p)
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
    for p in files:z.write(p,prefix+p.relative_to(root).as_posix())
with zipfile.ZipFile(output) as z:
    names=z.namelist()
    assert not any('.private' in n or n.endswith(('.db','.env.local')) for n in names)
    for required in ['public/index.html','api/index.py','supabase/schema.sql','supabase/002_dados.sql','migration/fotos_storage.zip','DEPLOY.md','vercel.json']:
        assert prefix+required in names
report={'file':str(output),'files':len(files),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'credentials_included':False,'original_sqlite_included':False,'cloud_deployed':False}
(root/'migration/package_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
