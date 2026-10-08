"""Vercel API. Supabase validates every token; RLS and RPC enforce MFA too."""
import os, json, io, csv, re, base64, secrets, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from email.parser import BytesParser
from email.policy import default

MAX_BODY = 4_000_000
COOKIE = '__Host-hm-session'

class APIError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status

def settings():
    url = os.environ.get('SUPABASE_URL','').rstrip('/')
    key = os.environ.get('SUPABASE_ANON_KEY','')
    if not url or not key: raise APIError('A aplicação online ainda está sendo configurada.',503)
    return url, key

def remote(path, method='GET', data=None, token=None, service=False, raw=False, headers=None):
    url, key = settings()
    if service:
        key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY','')
        if not key: raise APIError('Administração não configurada.',503)
    h = {'apikey':key}
    # New sb_publishable_/sb_secret_ keys are not JWTs and belong only in apikey.
    if token: h['Authorization']='Bearer '+token
    elif key.count('.')==2: h['Authorization']='Bearer '+key
    if headers: h.update(headers)
    if data is not None and not isinstance(data,bytes):
        data=json.dumps(data).encode();h['Content-Type']='application/json'
    req = urllib.request.Request(url+path,data=data,method=method,headers=h)
    try:
        with urllib.request.urlopen(req,timeout=25) as r:
            body=r.read()
            return body if raw else json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        try: detail=json.loads(e.read())
        except Exception: detail={}
        msg=detail.get('message') or detail.get('msg') or detail.get('error_description') or 'Não foi possível concluir a operação.'
        status=e.code if e.code in (400,401,403,404,409,422,429) else 502
        raise APIError(msg,status) from None
    except (urllib.error.URLError,TimeoutError):
        raise APIError('Serviço temporariamente indisponível. Tente novamente.',503) from None

def claims(token):
    try:
        part=token.split('.')[1];return json.loads(base64.urlsafe_b64decode(part+'='*(-len(part)%4)))
    except Exception: raise APIError('Sessão inválida.',401) from None

def validate_session(token, admin=False):
    if not token: raise APIError('Faça login para continuar.',401)
    # Decode only AFTER Supabase verifies signature, issuer, expiry and user existence.
    user=remote('/auth/v1/user',token=token)
    jwt=claims(token)
    if jwt.get('sub')!=user.get('id') or jwt.get('aal')!='aal2':
        raise APIError('Valide o código de dois fatores para continuar.',403)
    rows=remote('/rest/v1/profiles?'+urllib.parse.urlencode({'id':'eq.'+user['id'],'select':'id,email,name,role,active'}),token=token)
    if not rows or not rows[0]['active']: raise APIError('Conta sem acesso ao estoque.',403)
    if admin and rows[0]['role']!='admin': raise APIError('Somente o administrador pode gerenciar usuários.',403)
    return rows[0],jwt

def fold(s):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD',str(s or '').lower()) if not unicodedata.combining(c))

def integer(value, minimum=0):
    if isinstance(value,bool) or not str(value).isdigit() or int(value)<minimum:
        raise APIError('Informe uma quantidade inteira válida.')
    return int(value)

class handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def respond(self,obj,status=200,ctype='application/json; charset=utf-8',extra=None):
        data=obj if isinstance(obj,bytes) else json.dumps(obj,ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type',ctype);self.send_header('Cache-Control','private, no-store')
        self.send_header('Vary','Cookie, Authorization');self.send_header('X-Content-Type-Options','nosniff')
        if extra:
            for k,v in extra.items():self.send_header(k,v)
        self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def token(self):
        auth=self.headers.get('Authorization','')
        if auth.startswith('Bearer '):return auth[7:]
        cookie=SimpleCookie()
        try:cookie.load(self.headers.get('Cookie',''))
        except Exception:return ''
        return cookie[COOKIE].value if COOKIE in cookie else ''
    def body(self):
        n=int(self.headers.get('Content-Length','0'))
        if n>MAX_BODY:raise APIError('Arquivo muito grande. Use uma foto com menos de 3 MB.',413)
        return self.rfile.read(n)
    def json_body(self):
        try:return json.loads(self.body() or b'{}')
        except (ValueError,UnicodeError):raise APIError('Requisição inválida.') from None
    def multipart(self):
        typ=self.headers.get('Content-Type','')
        if not typ.startswith('multipart/form-data'):raise APIError('Formulário inválido.')
        msg=BytesParser(policy=default).parsebytes(b'Content-Type: '+typ.encode()+b'\r\nMIME-Version: 1.0\r\n\r\n'+self.body())
        fields,photo={},None
        for part in msg.iter_parts():
            key=part.get_param('name',header='content-disposition');payload=part.get_payload(decode=True) or b''
            if part.get_filename() and key=='photo':
                mime=part.get_content_type()
                valid=(mime=='image/jpeg' and payload.startswith(b'\xff\xd8\xff')) or (mime=='image/png' and payload.startswith(b'\x89PNG\r\n\x1a\n')) or (mime=='image/webp' and payload[:4]==b'RIFF' and payload[8:12]==b'WEBP') or (mime=='image/gif' and payload[:6] in (b'GIF87a',b'GIF89a'))
                if not valid:raise APIError('Use uma foto JPG, PNG, WebP ou GIF válida.')
                photo={'filename':part.get_filename().replace('\\','/').split('/')[-1][:200],'mime':mime,'data':payload}
            elif key:fields[key]=payload.decode('utf-8')
        return fields,photo
    def rows(self,table,**query):
        rows=[];offset=0
        while True:
            batch=remote('/rest/v1/'+table+'?'+urllib.parse.urlencode({**query,'offset':offset,'limit':1000}),token=self.auth_token)
            rows.extend(batch)
            if len(batch)<1000:return rows
            offset+=1000
    def command(self,action,pid=None,payload=None):
        return remote('/rest/v1/rpc/stock_command','POST',{'command':action,'pid':pid,'payload':payload or {}},token=self.auth_token)
    def products(self):
        rows=self.rows('products',select='*',order='name.asc,id.asc')
        photos=self.rows('photos',select='id,product_id,is_primary',review_status='eq.confirmada',order='is_primary.desc,id.asc')
        by={}
        for ph in photos:by.setdefault(ph['product_id'],[]).append(ph['id'])
        for p in rows:p.update(photo_id=(by.get(p['id']) or [None])[0],photo_count=len(by.get(p['id'],[])))
        return rows
    def do_GET(self):self.dispatch('GET')
    def do_POST(self):self.dispatch('POST')
    def do_DELETE(self):self.dispatch('DELETE')
    def dispatch(self,method):
        try:
            u=urllib.parse.urlsplit(self.path);path=u.path;qs=urllib.parse.parse_qs(u.query)
            if path=='/api/config' and method=='GET':
                url,key=settings();return self.respond({'supabaseUrl':url,'supabaseAnonKey':key})
            if method!='GET':
                origin=self.headers.get('Origin')
                expected=os.environ.get('APP_ORIGIN','').rstrip('/')
                request_origin='https://'+self.headers.get('Host','')
                if origin and origin not in (expected,request_origin):raise APIError('Origem da requisição inválida.',403)
                # Cookie-only writes require a same-origin browser request. Bearer requests are not ambient credentials.
                if not self.headers.get('Authorization','').startswith('Bearer ') and not origin:
                    raise APIError('Origem obrigatória.',403)
            if path=='/api/auth/logout' and method=='POST':
                return self.respond({'ok':True},extra={'Set-Cookie':f'{COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'})
            self.auth_token=self.token();profile,jwt=validate_session(self.auth_token)
            if path=='/api/auth/session' and method=='POST':
                ttl=max(0,min(3600,int(jwt['exp'])-int(datetime.now(timezone.utc).timestamp())))
                return self.respond(profile,extra={'Set-Cookie':f'{COOKIE}={self.auth_token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age={ttl}'})
            if path=='/api/me' and method=='GET':return self.respond(profile)
            if path.startswith('/api/admin/'):
                if profile['role']!='admin':raise APIError('Acesso restrito ao administrador.',403)
                return self.admin(method,path,profile)
            if method=='GET':return self.get(path,qs)
            if method=='POST':return self.post(path)
            if method=='DELETE' and re.fullmatch(r'/api/products/\d+',path):return self.respond(self.command('delete',int(path.rsplit('/',1)[1])))
            raise APIError('Rota não encontrada.',404)
        except APIError as e:self.respond({'error':e.message},e.status)
        except (ValueError,KeyError,TypeError):self.respond({'error':'Dados inválidos. Confira os campos.'},400)
        except Exception:self.respond({'error':'Não foi possível concluir a operação.'},500)
    def get(self,path,qs):
        if path=='/api/health':return self.respond({'ok':True,'storage':'supabase','mfa':True})
        if path=='/api/photo-review':
            status=qs.get('status',['pendente'])[0]
            if status not in ('pendente','confirmada','oculta','todas'):raise APIError('Filtro inválido.')
            query={'select':'id,product_id,filename,is_primary,review_status,review_note','order':'id.asc'}
            if status!='todas':query['review_status']='eq.'+status
            rows=self.rows('photos',**query);names={p['id']:p['name'] for p in self.rows('products',select='id,name')}
            for p in rows:p['product_name']=names.get(p['product_id'])
            return self.respond(rows)
        if path=='/api/history':
            limit=min(integer(qs.get('limit',[500])[0],1),1000)
            rows=remote('/rest/v1/movements?'+urllib.parse.urlencode({'select':'*,products(name)','order':'id.desc','limit':limit}),token=self.auth_token)
            for r in rows:r['product_name']=(r.pop('products') or {}).get('name','Peça removida')
            return self.respond(rows)
        if path=='/api/categories':
            by={}
            for p in self.rows('products',select='category'):
                if p['category']:by[p['category']]=by.get(p['category'],0)+1
            return self.respond([{'category':k,'qty':v} for k,v in sorted(by.items())])
        if path in ('/api/products','/api/stats','/api/export.csv'):
            rows=self.products()
            if path=='/api/stats':
                good=[p for p in rows if p['review_status']=='confirmado']
                pending=self.rows('photos',select='id',review_status='eq.pendente')
                return self.respond({'products':len(good),'units':sum(p['quantity'] for p in good),'low':sum(p['min_quantity']>0 and p['quantity']<=p['min_quantity'] for p in good),'no_photo':sum(not p['photo_id'] for p in good),'pending':len(rows)-len(good),'review_photos':len(pending)})
            if path=='/api/export.csv':
                out=io.StringIO();w=csv.writer(out,delimiter=';');w.writerow(['ID','Nome','Categoria','Quantidade','Estoque mínimo','Observações','Atualizado em','Conferência'])
                for p in rows:
                    cells=[p[k] for k in ['id','name','category','quantity','min_quantity','notes','updated_at','review_status']]
                    w.writerow(["'"+v if isinstance(v,str) and v.startswith(('=','+','-','@','\t','\r')) else v for v in cells])
                return self.respond(('\ufeff'+out.getvalue()).encode(),ctype='text/csv; charset=utf-8',extra={'Content-Disposition':'attachment; filename="estoque.csv"'})
            status=qs.get('status',['todos'])[0];q=fold(qs.get('q',[''])[0]);category=qs.get('category',[''])[0]
            if status not in ('todos','pendente','confirmado'):raise APIError('Filtro inválido.')
            rows=[p for p in rows if (status=='todos' or p['review_status']==status) and (not category or p['category']==category) and (not q or q in fold(p['name']+' '+p['category']+' '+p['notes']) or str(p['id'])==q) and ('low' not in qs or p['min_quantity']>0 and p['quantity']<=p['min_quantity']) and ('no_photo' not in qs or not p['photo_id'])]
            return self.respond(rows)
        if re.fullmatch(r'/api/products/\d+',path):
            pid=integer(path.rsplit('/',1)[1],1);rows=self.rows('products',select='*',id='eq.'+str(pid))
            if not rows:raise APIError('Produto não encontrado.',404)
            p=rows[0];p['photos']=self.rows('photos',select='id,filename,mime,is_primary,created_at',product_id='eq.'+str(pid),review_status='eq.confirmada',order='is_primary.desc,id.asc')
            p['movements']=remote('/rest/v1/movements?'+urllib.parse.urlencode({'product_id':'eq.'+str(pid),'order':'id.desc','limit':100}),token=self.auth_token)
            return self.respond(p)
        if re.fullmatch(r'/api/photos/\d+',path):
            rows=self.rows('photos',select='storage_path,mime',id='eq.'+path.rsplit('/',1)[1])
            if not rows:raise APIError('Foto não encontrada.',404)
            ph=rows[0];data=remote('/storage/v1/object/authenticated/stock-photos/'+urllib.parse.quote(ph['storage_path'],safe='/'),token=self.auth_token,raw=True)
            return self.respond(data,ctype=ph['mime'])
        if path=='/api/backup':
            # Metadata backup is private. Original photo objects are referenced, not exposed as public URLs.
            tables={t:self.rows(t,select='*') for t in ['products','photos','movements','audit_log']}
            content={'format':'happy-machine-online-v1','created_at':datetime.now(timezone.utc).isoformat(),'tables':tables}
            return self.respond(json.dumps(content,ensure_ascii=False).encode(),ctype='application/json',extra={'Content-Disposition':'attachment; filename="estoque_online.json"'})
        raise APIError('Rota não encontrada.',404)
    def post(self,path):
        if path=='/api/products' or re.fullmatch(r'/api/products/\d+/update',path):
            fields,photo=self.multipart();uploaded=None
            for k in ('quantity','min_quantity','existing_photo_id'):
                if k in fields:fields[k]=integer(fields[k],1 if k=='existing_photo_id' else 0)
            if not str(fields.get('name','')).strip() or len(fields['name'])>160:raise APIError('Informe um nome de até 160 caracteres.')
            if fields.get('existing_photo_id') and photo:raise APIError('Escolha apenas uma foto.')
            try:
                if photo:
                    suffix={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif'}[photo['mime']]
                    uploaded='uploads/'+secrets.token_hex(24)+suffix
                    remote('/storage/v1/object/stock-photos/'+uploaded,'POST',photo['data'],token=self.auth_token,headers={'Content-Type':photo['mime']})
                    fields['photo']={k:photo[k] for k in ('filename','mime')};fields['photo']['storage_path']=uploaded
                result=self.command('create' if path=='/api/products' else 'update',None if path=='/api/products' else int(path.split('/')[3]),fields)
                return self.respond(result,201 if path=='/api/products' else 200)
            except Exception:
                if uploaded:
                    try:remote('/storage/v1/object/stock-photos','DELETE',{'prefixes':[uploaded]},token=self.auth_token)
                    except Exception:pass
                raise
        if re.fullmatch(r'/api/products/\d+/(movement|confirm)',path):
            parts=path.split('/');return self.respond(self.command(parts[4],int(parts[3]),self.json_body()))
        if re.fullmatch(r'/api/photos/\d+/review',path):return self.respond(self.command('review_photo',int(path.split('/')[3]),self.json_body()))
        if path=='/api/restore':raise APIError('Restauração online deve ser realizada pelo administrador com o procedimento de recuperação.',409)
        raise APIError('Rota não encontrada.',404)
    def admin(self,method,path,profile):
        if path=='/api/admin/users' and method=='GET':return self.respond(self.rows('profiles',select='id,email,name,role,active,created_at',order='created_at.desc'))
        if path=='/api/admin/users' and method=='POST':
            data=self.json_body();email=str(data.get('email','')).strip().lower();name=str(data.get('name','')).strip()[:100]
            if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):raise APIError('Informe um e-mail válido.')
            password=secrets.token_urlsafe(24)+'aA9!'
            user=remote('/auth/v1/admin/users','POST',{'email':email,'password':password,'email_confirm':True,'user_metadata':{'name':name}},service=True)
            uid=user['id']
            try:
                remote('/rest/v1/profiles','POST',{'id':uid,'email':email,'name':name,'role':'operator','active':True},service=True)
                remote('/rest/v1/audit_log','POST',{'action':'create_user','after_data':json.dumps({'id':uid,'email':email}),'actor_id':profile['id']},service=True)
            except Exception:
                # User without a profile has no stock access; do not grant access on partial setup.
                raise APIError('Não foi possível concluir o cadastro. A conta ainda não tem acesso.',502)
            return self.respond({'ok':True,'id':uid,'email':email,'password':password},201)
        if re.fullmatch(r'/api/admin/users/[0-9a-f-]{36}/active',path) and method=='POST':
            uid=path.split('/')[4];data=self.json_body();active=data.get('active')
            if not isinstance(active,bool):raise APIError('Situação inválida.')
            users=remote('/rest/v1/profiles?'+urllib.parse.urlencode({'id':'eq.'+uid,'select':'role'}),service=True)
            if not users:raise APIError('Usuário não encontrado.',404)
            if users[0]['role']=='admin':raise APIError('O administrador principal não pode ser desativado.')
            remote('/rest/v1/profiles?'+urllib.parse.urlencode({'id':'eq.'+uid}),'PATCH',{'active':active},service=True)
            remote('/rest/v1/audit_log','POST',{'action':'user_active','after_data':json.dumps({'id':uid,'active':active}),'actor_id':profile['id']},service=True)
            return self.respond({'ok':True})
        raise APIError('Rota não encontrada.',404)
