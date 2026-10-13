"""Vercel API. Supabase validates every token; RLS and RPC enforce password + email confirmation too."""
import os, json, io, csv, re, base64, secrets, hashlib, urllib.request, urllib.parse, urllib.error
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

def quantity_unit(product):
    return 'm' if 'unidade de medida: metros.' in str(product.get('notes', '')).casefold() else 'un'

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
        if path.split('?')[0]=='/auth/v1/otp' and e.code>=500:
            raise APIError('O serviço de e-mail não conseguiu enviar o código. O administrador precisa revisar o SMTP no Supabase (servidor, porta, remetente e senha de app). Aguarde 60 segundos antes de tentar novamente.',503) from None
        try: detail=json.loads(e.read())
        except Exception: detail={}
        if path.startswith('/storage/v1/object/') and (detail.get('code')=='NoSuchKey' or str(detail.get('statusCode'))=='404'):
            raise APIError('Arquivo da foto não encontrado no Storage privado.',404) from None
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
    if jwt.get('sub')!=user.get('id') or not jwt.get('session_id'):
        raise APIError('Valide o código de dois fatores para continuar.',403)
    if remote('/rest/v1/rpc/stock_access','POST',{'admin_only':False},token=token) is not True:
        raise APIError('Confirme o código enviado ao seu e-mail para continuar.',403)
    rows=remote('/rest/v1/profiles?'+urllib.parse.urlencode({'id':'eq.'+user['id'],'select':'id,email,name,role,active'}),token=token)
    if not rows or not rows[0]['active']: raise APIError('Conta sem acesso ao estoque.',403)
    if admin and rows[0]['role']!='admin': raise APIError('Somente o administrador pode gerenciar usuários.',403)
    return rows[0],jwt

def fold(s):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD',str(s or '').lower()) if not unicodedata.combining(c))

def product_name_key(name):
    words=re.findall(r'[a-z0-9]+',fold(name))
    if words and words[0]=='chaves':words[0]='chave'
    return ' '.join(words)

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
        self.request_stage='read_body'
        n=int(self.headers.get('Content-Length','0'))
        if n>MAX_BODY:raise APIError('Arquivo muito grande. Use uma foto com menos de 3 MB.',413)
        return self.rfile.read(n)
    def json_body(self):
        self.request_stage='json_body'
        try:return json.loads(self.body() or b'{}')
        except (ValueError,UnicodeError):raise APIError('Requisição inválida.') from None
    def multipart(self):
        self.request_stage='multipart'
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
    def stock_command(self,action,pid=None,payload=None):
        self.request_stage='stock_command'
        return remote('/rest/v1/rpc/stock_command','POST',{'command':action,'pid':pid,'payload':payload or {}},token=self.auth_token)
    def products(self):
        rows=self.rows('products',select='*',order='name.asc,id.asc')
        photos=self.rows('photos',select='id,product_id,is_primary',review_status='eq.confirmada',order='is_primary.desc,id.asc')
        by={}
        for ph in photos:by.setdefault(ph['product_id'],[]).append(ph['id'])
        for p in rows:p.update(photo_id=(by.get(p['id']) or [None])[0],photo_count=len(by.get(p['id'],[])),quantity_unit=quantity_unit(p))
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
                try:
                    logout_token=self.token()
                    _,logout_jwt=validate_session(logout_token)
                    remote('/rest/v1/email_login_sessions?'+urllib.parse.urlencode({'session_id':'eq.'+logout_jwt['session_id'],'user_id':'eq.'+logout_jwt['sub']}),'DELETE',service=True)
                except APIError: pass
                return self.respond({'ok':True},extra={'Set-Cookie':f'{COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'})
            if path in ('/api/auth/login','/api/auth/verify') and method=='POST':
                if self.headers.get('Origin') not in (expected,request_origin):
                    raise APIError('Origem obrigatória.',403)
                return self.email_login(path,self.json_body())
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
            if method=='DELETE' and re.fullmatch(r'/api/products/\d+',path):return self.respond(self.stock_command('delete',int(path.rsplit('/',1)[1])))
            raise APIError('Rota não encontrada.',404)
        except APIError as e:self.respond({'error':e.message},e.status)
        except (ValueError,KeyError,TypeError) as e:
            import logging,traceback
            logging.error('Request processing failed: %s\n%s',type(e).__name__,traceback.format_exc())
            self.respond({'error':'Dados inválidos. Confira os campos.','code':type(e).__name__,'stage':getattr(self,'request_stage','dispatch')},400)
        except Exception:self.respond({'error':'Não foi possível concluir a operação.'},500)
    def email_login(self,path,body):
        if path=='/api/auth/login':
            email=str(body.get('email','')).strip().lower()
            password=body.get('password','')
            if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or not isinstance(password,str) or not password or len(password)>1024:
                raise APIError('E-mail ou senha inválidos.',401)
            try: session=remote('/auth/v1/token?grant_type=password','POST',{'email':email,'password':password})
            except APIError as e:
                if e.status in (400,401,403,422):raise APIError('E-mail ou senha inválidos.',401) from None
                raise
            user=session['user']
            profiles=remote('/rest/v1/profiles?'+urllib.parse.urlencode({'id':'eq.'+user['id'],'select':'id,email,active'}),service=True)
            if not profiles or not profiles[0]['active']:raise APIError('Conta sem acesso ao estoque.',403)
            email=user['email']
            challenge=secrets.token_urlsafe(32)
            digest=hashlib.sha256(challenge.encode()).hexdigest()
            remote('/rest/v1/rpc/email_login_command','POST',{'action':'begin','secret_hash':digest,'uid':user['id'],'email_address':email},service=True)
            # Não cria usuários. A senha foi verificada antes de qualquer envio.
            remote('/auth/v1/otp','POST',{'email':email,'create_user':False})
            try:remote('/auth/v1/logout?scope=local','POST',token=session['access_token'])
            except APIError:pass
            return self.respond({'challenge':challenge,'expiresIn':600})
        challenge=body.get('challenge','');code=body.get('code','')
        if not isinstance(challenge,str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}',challenge) or not isinstance(code,str) or not re.fullmatch(r'(?:[0-9]{6}|[0-9]{8})',code):
            raise APIError('Informe o código completo enviado ao e-mail (6 ou 8 dígitos).')
        digest=hashlib.sha256(challenge.encode()).hexdigest()
        attempt=remote('/rest/v1/rpc/email_login_command','POST',{'action':'attempt','secret_hash':digest},service=True)
        try:session=remote('/auth/v1/verify','POST',{'email':attempt['email'],'token':code,'type':'email'})
        except APIError as e:
            if e.status in (400,401,403,422):raise APIError('Código inválido ou expirado. Confira seu e-mail.') from None
            raise
        user=remote('/auth/v1/user',token=session['access_token'])
        jwt=claims(session['access_token'])
        if user['id']!=attempt['user_id'] or jwt.get('sub')!=user['id'] or not jwt.get('session_id'):
            raise APIError('Sessão inválida.',403)
        remote('/rest/v1/rpc/email_login_command','POST',{'action':'complete','secret_hash':digest,'uid':user['id'],'sid':jwt['session_id']},service=True)
        return self.respond({'access_token':session['access_token'],'refresh_token':session['refresh_token']})
    def get(self,path,qs):
        if path=='/api/repairs':
            return self.respond(self.rows('repairs',select='id,name,category,quantity,defect,notes,status,photo_path,created_at,updated_at',archived_at='is.null',order='created_at.desc,id.desc'))
        if re.fullmatch(r'/api/repairs/\d+/photo',path):
            rows=self.rows('repairs',select='photo_path,photo_mime',id='eq.'+path.split('/')[3],archived_at='is.null')
            if not rows or not rows[0]['photo_path']:raise APIError('Foto não encontrada.',404)
            ph=rows[0]
            data=remote('/storage/v1/object/authenticated/stock-photos/'+urllib.parse.quote(ph['photo_path'],safe='/'),token=self.auth_token,raw=True)
            return self.respond(data,ctype=ph['photo_mime'])
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
                return self.respond({'products':len(good),'units':sum(p['quantity'] for p in good if quantity_unit(p)=='un'),'meters':sum(p['quantity'] for p in good if quantity_unit(p)=='m'),'low':sum(p['min_quantity']>0 and p['quantity']<=p['min_quantity'] for p in good),'no_photo':sum(not p['photo_id'] for p in good),'pending':len(rows)-len(good),'review_photos':len(pending)})
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
            tables={t:self.rows(t,select='*') for t in ['products','photos','movements','audit_log','repairs']}
            content={'format':'happy-machine-online-v1','created_at':datetime.now(timezone.utc).isoformat(),'tables':tables}
            return self.respond(json.dumps(content,ensure_ascii=False).encode(),ctype='application/json',extra={'Content-Disposition':'attachment; filename="estoque_online.json"'})
        raise APIError('Rota não encontrada.',404)
    def post(self,path):
        if path=='/api/repairs' or re.fullmatch(r'/api/repairs/\d+/(update|archive)',path):
            archived=path.endswith('/archive')
            fields,photo=(self.json_body(),None) if archived else self.multipart()
            payload={k:fields[k] for k in ('name','category','quantity','defect','notes','status','updated_at') if k in fields}
            if not archived:
                payload['quantity']=integer(payload.get('quantity',0),1)
                if payload['quantity']>1000000:raise APIError('Quantidade muito grande.')
                if not str(payload.get('name','')).strip() or len(payload['name'])>160:raise APIError('Informe o nome da peça.')
                if not str(payload.get('defect','')).strip() or len(payload['defect'])>2000:raise APIError('Descreva o defeito em até 2000 caracteres.')
                if payload.get('status','aguardando') not in ('aguardando','em_conserto','consertada','sem_conserto'):raise APIError('Situação inválida.')
            action='create' if path=='/api/repairs' else 'archive' if archived else 'update'
            pid=None if action=='create' else integer(path.split('/')[3],1)
            uploaded=None
            try:
                if photo:
                    suffix={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif'}[photo['mime']]
                    uploaded='repairs/'+secrets.token_hex(24)+suffix
                    remote('/storage/v1/object/stock-photos/'+uploaded,'POST',photo['data'],service=True,headers={'Content-Type':photo['mime']})
                    payload.update(photo_path=uploaded,photo_mime=photo['mime'])
                result=remote('/rest/v1/rpc/repair_command','POST',{'command':action,'pid':pid,'payload':payload},token=self.auth_token)
            except Exception:
                if uploaded:
                    try:remote('/storage/v1/object/stock-photos','DELETE',{'prefixes':[uploaded]},service=True)
                    except APIError:pass
                raise
            return self.respond(result,201 if action=='create' else 200)
        if path=='/api/photos/urls':
            ids=self.json_body().get('ids',[])
            if not isinstance(ids,list) or len(ids)>500:raise APIError('Lista de fotos inválida.')
            ids=list(dict.fromkeys(integer(value,1) for value in ids))
            if not ids:return self.respond({})
            rows=self.rows('photos',select='id,storage_path',id='in.('+','.join(map(str,ids))+')')
            paths=[r['storage_path'] for r in rows]
            if not paths:return self.respond({})
            signed=remote('/storage/v1/object/sign/stock-photos','POST',{'paths':paths,'expiresIn':600},token=self.auth_token)
            by_path={r['path']:r for r in signed}
            base=settings()[0]+'/storage/v1'
            result={}
            for row in rows:
                item=by_path.get(row['storage_path'],{})
                url=item.get('signedURL') or item.get('signedUrl')
                if url and not item.get('error'):result[str(row['id'])]=base+url
            return self.respond(result)
        if path=='/api/products' or re.fullmatch(r'/api/products/\d+/update',path):
            fields,photo=self.multipart();uploaded=None
            for k in ('quantity','min_quantity','existing_photo_id'):
                if k in fields:fields[k]=integer(fields[k],1 if k=='existing_photo_id' else 0)
            if not str(fields.get('name','')).strip() or len(fields['name'])>160:raise APIError('Informe um nome de até 160 caracteres.')
            if fields.get('existing_photo_id') and photo:raise APIError('Escolha apenas uma foto.')
            if path=='/api/products':
                key=product_name_key(fields['name'])
                existing=remote('/rest/v1/products?select=id,name',token=self.auth_token)
                match=next((p for p in existing if product_name_key(p['name'])==key),None)
                if match:raise APIError(f'Esta peça já está cadastrada: {match["name"]} (#{match["id"]}). Abra o cadastro existente e use Entrada ou Ajustar para atualizar a quantidade.',409)
            try:
                if photo:
                    suffix={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif'}[photo['mime']]
                    uploaded='uploads/'+secrets.token_hex(24)+suffix
                    remote('/storage/v1/object/stock-photos/'+uploaded,'POST',photo['data'],token=self.auth_token,headers={'Content-Type':photo['mime']})
                    fields['photo']={k:photo[k] for k in ('filename','mime')};fields['photo']['storage_path']=uploaded
                result=self.stock_command('create' if path=='/api/products' else 'update',None if path=='/api/products' else int(path.split('/')[3]),fields)
                return self.respond(result,201 if path=='/api/products' else 200)
            except Exception:
                if uploaded:
                    try:remote('/storage/v1/object/stock-photos','DELETE',{'prefixes':[uploaded]},token=self.auth_token)
                    except Exception:pass
                raise
        if re.fullmatch(r'/api/products/\d+/(movement|confirm)',path):
            parts=path.split('/');return self.respond(self.stock_command(parts[4],int(parts[3]),self.json_body()))
        if re.fullmatch(r'/api/photos/\d+/review',path):return self.respond(self.stock_command('review_photo',int(path.split('/')[3]),self.json_body()))
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
