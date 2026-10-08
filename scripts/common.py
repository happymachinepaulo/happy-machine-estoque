import json, os, urllib.request, urllib.parse, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT/'.private'

class RemoteError(SystemExit):
    def __init__(self,status,path):
        self.status=status
        super().__init__(f'Supabase respondeu HTTP {status} em {path.split("?")[0]}. Revise a configuração e execute novamente.')

def load_env():
    path=ROOT/'.env.local'
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            if line.strip() and not line.startswith('#') and '=' in line:
                k,v=line.split('=',1);os.environ.setdefault(k.strip(),v.strip().strip('"').strip("'"))

def remote(path,method='GET',data=None,service=True,headers=None):
    load_env();url=os.environ.get('SUPABASE_URL','').rstrip('/')
    key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY' if service else 'SUPABASE_ANON_KEY','')
    if not url or not key:raise SystemExit('Configure .env.local na raiz estoque_site_local com as chaves do NOVO projeto Supabase. Nenhuma chave será impressa.')
    h={'apikey':key}
    if key.count('.')==2:h['Authorization']='Bearer '+key
    if headers:h.update(headers)
    if data is not None and not isinstance(data,bytes):data=json.dumps(data,ensure_ascii=False).encode();h['Content-Type']='application/json'
    try:
        with urllib.request.urlopen(urllib.request.Request(url+path,data=data,method=method,headers=h),timeout=60) as r:
            raw=r.read();return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        # No credential-bearing URLs or full request objects in error logs.
        raise RemoteError(e.code,path) from None

def all_rows(table):
    out=[]
    while True:
        batch=remote('/rest/v1/'+table+'?'+urllib.parse.urlencode({'select':'*','order':'id.asc','offset':len(out),'limit':1000}))
        out.extend(batch)
        if len(batch)<1000:return out

def assert_closed_signup():
    s=remote('/auth/v1/settings',service=False)
    if not s.get('disable_signup'):raise SystemExit('Desative Allow new users to sign up no Supabase antes de migrar ou criar o administrador.')
