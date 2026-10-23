"""API do estoque Happy Machine (Vercel). O Supabase valida cada token; RLS e RPC exigem senha + e-mail.

Desempenho: conexões HTTPS reutilizadas, validação de sessão em paralelo e com cache curto,
consultas combinadas (produto + fotos numa só) e URLs assinadas de fotos em lote e em cache.
"""
import os, json, io, csv, re, time, base64, secrets, hashlib, threading, unicodedata
import http.client, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from email.parser import BytesParser
from email.policy import default

MAX_BODY = 4_000_000
SESSION_TTL = 30          # segundos que uma sessão validada fica em cache
SIGN_TTL = 3600           # validade das URLs assinadas de fotos
SIGN_REUSE = 3000         # reaproveita URL assinada por este tempo
PHOTO_TYPES = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif'}


class APIError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


# ───────────────────────── Supabase (conexão reutilizada) ─────────────────────────
_local = threading.local()
_pool = ThreadPoolExecutor(max_workers=8)


def settings():
    url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('SUPABASE_ANON_KEY', '')
    if not url or not key:
        raise APIError('A aplicação online ainda está sendo configurada.', 503)
    return url, key


def _connection(host, fresh=False):
    conn = getattr(_local, 'conn', None)
    if fresh or conn is None or getattr(_local, 'host', None) != host:
        if conn is not None:
            try: conn.close()
            except Exception: pass
        conn = http.client.HTTPSConnection(host, timeout=25)
        _local.conn, _local.host = conn, host
    return conn


def _send(url, path, method, data, headers):
    host = urllib.parse.urlsplit(url).netloc
    for attempt in (0, 1):
        reused = getattr(_local, 'conn', None) is not None and getattr(_local, 'host', None) == host
        conn = _connection(host, fresh=attempt == 1)
        try:
            conn.request(method, path, body=data, headers=headers)
            resp = conn.getresponse()
            return resp.status, resp.read(), resp.getheaders()
        except (http.client.RemoteDisconnected, BrokenPipeError, ConnectionResetError, http.client.CannotSendRequest, http.client.ResponseNotReady):
            _local.conn = None
            if attempt == 0 and reused:
                continue   # conexão ociosa fechada pelo servidor: tenta de novo uma vez
            raise APIError('Serviço temporariamente indisponível. Tente novamente.', 503) from None
        except (OSError, http.client.HTTPException):
            _local.conn = None
            raise APIError('Serviço temporariamente indisponível. Tente novamente.', 503) from None


def remote(path, method='GET', data=None, token=None, service=False, raw=False, headers=None, count=False):
    url, key = settings()
    if service:
        key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
        if not key:
            raise APIError('Administração não configurada.', 503)
    h = {'apikey': key, 'Accept-Encoding': 'identity'}
    # Chaves novas sb_publishable_/sb_secret_ não são JWT e só vão em apikey.
    if token: h['Authorization'] = 'Bearer ' + token
    elif key.count('.') == 2: h['Authorization'] = 'Bearer ' + key
    if count: h['Prefer'] = 'count=exact'
    if headers: h.update(headers)
    if data is not None and not isinstance(data, bytes):
        data = json.dumps(data).encode(); h['Content-Type'] = 'application/json'
    status, body, resp_headers = _send(url, path, method, data, h)
    if status >= 400:
        if path.split('?')[0] == '/auth/v1/otp' and status >= 500:
            raise APIError('O serviço de e-mail não conseguiu enviar o código. O administrador precisa revisar o SMTP no Supabase (servidor, porta, remetente e senha de app). Aguarde 60 segundos antes de tentar novamente.', 503)
        try: detail = json.loads(body)
        except Exception: detail = {}
        if not isinstance(detail, dict): detail = {}
        if path.startswith('/storage/v1/object/') and (detail.get('code') == 'NoSuchKey' or str(detail.get('statusCode')) == '404'):
            raise APIError('Arquivo da foto não encontrado no Storage privado.', 404)
        msg = detail.get('message') or detail.get('msg') or detail.get('error_description') or 'Não foi possível concluir a operação.'
        raise APIError(msg, status if status in (400, 401, 403, 404, 409, 422, 429) else 502)
    result = body if raw else (json.loads(body) if body else None)
    if count:
        total = dict((k.lower(), v) for k, v in resp_headers).get('content-range', '*/0').rsplit('/', 1)[-1]
        return result, int(total) if total.isdigit() else len(result or [])
    return result


# ───────────────────────── Utilidades ─────────────────────────
def claims(token):
    try:
        part = token.split('.')[1]
        return json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)))
    except Exception:
        raise APIError('Sessão inválida.', 401) from None


def fold(s):
    return ''.join(c for c in unicodedata.normalize('NFD', str(s or '').lower()) if not unicodedata.combining(c))


def product_name_key(name):
    words = re.findall(r'[a-z0-9]+', fold(name))
    if words and words[0] == 'chaves': words[0] = 'chave'
    return ''.join(words)


def integer(value, minimum=0):
    if isinstance(value, bool) or not str(value).isdigit() or int(value) < minimum:
        raise APIError('Informe uma quantidade inteira válida.')
    return int(value)


def quantity_unit(product):
    note = str(product.get('notes', '')).casefold()
    if 'unidade de medida: metros.' in note: return 'm'
    if 'unidade de medida: lote.' in note: return 'lote'
    return 'un'


def valid_image(mime, payload):
    return ((mime == 'image/jpeg' and payload.startswith(b'\xff\xd8\xff')) or
            (mime == 'image/png' and payload.startswith(b'\x89PNG\r\n\x1a\n')) or
            (mime == 'image/webp' and payload[:4] == b'RIFF' and payload[8:12] == b'WEBP') or
            (mime == 'image/gif' and payload[:6] in (b'GIF87a', b'GIF89a')))


# ───────────────────────── Sessão (3 consultas em paralelo + cache) ─────────────────────────
_sessions = {}
_sessions_lock = threading.Lock()


def _verify(token):
    jwt = claims(token)
    sub = str(jwt.get('sub', ''))
    if not re.fullmatch(r'[0-9a-f-]{36}', sub) or not jwt.get('session_id'):
        raise APIError('Valide o código enviado ao seu e-mail para continuar.', 403)
    f_user = _pool.submit(remote, '/auth/v1/user', token=token)
    f_access = _pool.submit(remote, '/rest/v1/rpc/stock_access', 'POST', {'admin_only': False}, token=token)
    f_profile = _pool.submit(remote, '/rest/v1/profiles?' + urllib.parse.urlencode({'id': 'eq.' + sub, 'select': 'id,email,name,role,active'}), token=token)
    user = f_user.result()            # o token só vale depois que o Supabase o aceita
    if jwt.get('sub') != user.get('id'):
        raise APIError('Valide o código enviado ao seu e-mail para continuar.', 403)
    if f_access.result() is not True:
        raise APIError('Confirme o código enviado ao seu e-mail para continuar.', 403)
    rows = f_profile.result()
    if not rows or not rows[0]['active']:
        raise APIError('Conta sem acesso ao estoque.', 403)
    return rows[0], jwt


def validate_session(token, admin=False):
    if not token: raise APIError('Faça login para continuar.', 401)
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.time()
    with _sessions_lock:
        hit = _sessions.get(key)
    if hit and hit[0] > now:
        profile, jwt = hit[1], hit[2]
    else:
        profile, jwt = _verify(token)
        with _sessions_lock:
            if len(_sessions) > 256:
                for k in [k for k, v in _sessions.items() if v[0] <= now]: _sessions.pop(k, None)
            _sessions[key] = (now + SESSION_TTL, profile, jwt)
    if admin and profile['role'] != 'admin':
        raise APIError('Somente o administrador pode gerenciar usuários.', 403)
    return profile, jwt


def forget_session(token):
    with _sessions_lock:
        _sessions.pop(hashlib.sha256(token.encode()).hexdigest(), None)


# ───────────────────────── Fotos: URLs assinadas em lote ─────────────────────────
_signed = {}
_signed_lock = threading.Lock()


def sign_paths(paths, token):
    """Devolve {caminho: url}. Reaproveita URLs já assinadas e assina o resto numa só chamada."""
    paths = [p for p in dict.fromkeys(paths) if p]
    now = time.time()
    with _signed_lock:
        out = {p: _signed[p][1] for p in paths if p in _signed and _signed[p][0] > now}
    missing = [p for p in paths if p not in out]
    base = settings()[0] + '/storage/v1'
    chunks = [missing[i:i + 200] for i in range(0, len(missing), 200)]
    def sign(chunk):
        try: return remote('/storage/v1/object/sign/stock-photos', 'POST', {'paths': chunk, 'expiresIn': SIGN_TTL}, token=token) or []
        except APIError: return []
    for result in (list(_pool.map(sign, chunks)) if chunks else []):
        for item in result:
            url = item.get('signedURL') or item.get('signedUrl')
            if url and not item.get('error'):
                out[item['path']] = base + url
                with _signed_lock: _signed[item['path']] = (now + SIGN_REUSE, base + url)
    return out


def with_urls(rows, token, key='storage_path', thumb='thumb_path'):
    """Acrescenta url (original) e thumb (miniatura, se existir) a cada linha."""
    urls = sign_paths([r.get(key) for r in rows] + [r.get(thumb) for r in rows], token)
    for r in rows:
        r['url'] = urls.get(r.get(key))
        r['thumb'] = urls.get(r.get(thumb)) or r['url']
    return rows


# ───────────────────────── Consultas ─────────────────────────
def rows(table, token, **query):
    out, offset = [], 0
    while True:
        batch = remote('/rest/v1/' + table + '?' + urllib.parse.urlencode({**query, 'offset': offset, 'limit': 1000}), token=token)
        out.extend(batch)
        if len(batch) < 1000: return out
        offset += 1000


PHOTO_EMBED = 'photos(id,is_primary,storage_path,thumb_path)'
PHOTO_EMBED_BASIC = 'photos(id,is_primary,storage_path)'


def catalogue(token):
    """Todos os produtos com a foto principal, numa única consulta."""
    def fetch(embed):
        return rows('products', token, select='id,name,category,quantity,min_quantity,notes,review_status,updated_at,' + embed,
                    **{'order': 'name.asc,id.asc', 'photos.review_status': 'eq.confirmada', 'photos.order': 'is_primary.desc,id.asc'})
    try: items = fetch(PHOTO_EMBED)
    except APIError as e:
        if e.status != 400: raise
        items = fetch(PHOTO_EMBED_BASIC)   # migração 017 ainda não aplicada
    firsts = []
    for p in items:
        photos = p.pop('photos', None) or []
        p['photo_count'] = len(photos)
        p['photo_id'] = photos[0]['id'] if photos else None
        p['_path'], p['_thumb'] = (photos[0]['storage_path'], photos[0].get('thumb_path')) if photos else (None, None)
        p['unit'] = quantity_unit(p)
        p['broken'] = 'Este cadastro tem ZERO unidades disponíveis' in (p.get('notes') or '')
        firsts.append(p)
    with_urls(firsts, token, key='_path', thumb='_thumb')
    for p in firsts:
        p['photo'] = p.pop('thumb'); p.pop('url', None); p.pop('_path', None); p.pop('_thumb', None)
        p['notes'] = (p.get('notes') or '')[:220]
    return firsts


def pending_photos(token):
    return len(rows('photos', token, select='id', review_status='eq.pendente'))


def photo_rows(token, **query):
    try:
        data = remote('/rest/v1/photos?' + urllib.parse.urlencode({'select': 'id,product_id,filename,is_primary,review_status,review_note,storage_path,thumb_path,created_at,products(name)', **query}), token=token, count=True)
    except APIError as e:
        if e.status != 400: raise
        data = remote('/rest/v1/photos?' + urllib.parse.urlencode({'select': 'id,product_id,filename,is_primary,review_status,review_note,storage_path,created_at,products(name)', **query}), token=token, count=True)
    items, total = data
    for r in items:
        r['product_name'] = (r.pop('products', None) or {}).get('name')
    return with_urls(items, token), total


class handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass

    def respond(self, obj, status=200, ctype='application/json; charset=utf-8', extra=None):
        data = obj if isinstance(obj, bytes) else json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
        self.send_response(status)
        self.send_header('Content-Type', ctype); self.send_header('Cache-Control', 'private, no-store')
        self.send_header('Vary', 'Authorization'); self.send_header('X-Content-Type-Options', 'nosniff')
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def token(self):
        auth = self.headers.get('Authorization', '')
        return auth[7:] if auth.startswith('Bearer ') else ''

    def body(self):
        n = int(self.headers.get('Content-Length', '0') or 0)
        if n > MAX_BODY: raise APIError('Arquivo muito grande. Envie uma foto menor.', 413)
        return self.rfile.read(n)

    def json_body(self):
        try: return json.loads(self.body() or b'{}')
        except (ValueError, UnicodeError): raise APIError('Requisição inválida.') from None

    def multipart(self):
        typ = self.headers.get('Content-Type', '')
        if not typ.startswith('multipart/form-data'): raise APIError('Formulário inválido.')
        msg = BytesParser(policy=default).parsebytes(b'Content-Type: ' + typ.encode() + b'\r\nMIME-Version: 1.0\r\n\r\n' + self.body())
        fields, files = {}, {}
        for part in msg.iter_parts():
            key = part.get_param('name', header='content-disposition'); payload = part.get_payload(decode=True) or b''
            if part.get_filename() and key in ('photo', 'thumb'):
                mime = part.get_content_type()
                if not valid_image(mime, payload): raise APIError('Use uma foto JPG, PNG, WebP ou GIF válida.')
                files[key] = {'filename': part.get_filename().replace('\\', '/').split('/')[-1][:200], 'mime': mime, 'data': payload}
            elif key: fields[key] = payload.decode('utf-8')
        return fields, files.get('photo'), files.get('thumb')

    # ── roteamento ──
    def do_GET(self): self.dispatch('GET')
    def do_POST(self): self.dispatch('POST')
    def do_DELETE(self): self.dispatch('DELETE')

    def dispatch(self, method):
        try:
            u = urllib.parse.urlsplit(self.path); path = u.path; qs = urllib.parse.parse_qs(u.query)
            if path == '/api/health' and method == 'GET': return self.respond({'ok': True})
            if path.startswith('/api/auth/') and method == 'POST':
                expected = os.environ.get('APP_ORIGIN', '').rstrip('/')
                if self.headers.get('Origin') not in (expected, 'https://' + self.headers.get('Host', '')):
                    raise APIError('Origem inválida.', 403)
                return self.auth(path)
            self.auth_token = self.token()
            profile, jwt = validate_session(self.auth_token)
            if path == '/api/me': return self.respond(profile)
            if path.startswith('/api/admin/'):
                if profile['role'] != 'admin': raise APIError('Acesso restrito ao administrador.', 403)
                return self.admin(method, path, profile)
            if method == 'GET': return self.get(path, qs, profile)
            if method == 'POST': return self.post(path)
            if method == 'DELETE' and re.fullmatch(r'/api/products/\d+', path):
                return self.respond(self.stock_command('delete', int(path.rsplit('/', 1)[1])))
            raise APIError('Rota não encontrada.', 404)
        except APIError as e: self.respond({'error': e.message}, e.status)
        except (ValueError, KeyError, TypeError) as e:
            import logging, traceback
            logging.error('Falha ao processar: %s\n%s', type(e).__name__, traceback.format_exc())
            self.respond({'error': 'Dados inválidos. Confira os campos.', 'code': type(e).__name__}, 400)
        except Exception:
            self.respond({'error': 'Não foi possível concluir a operação.'}, 500)

    def stock_command(self, action, pid=None, payload=None):
        return remote('/rest/v1/rpc/stock_command', 'POST', {'command': action, 'pid': pid, 'payload': payload or {}}, token=self.auth_token)

    # ── autenticação: senha → código por e-mail → sessão ──
    def auth(self, path):
        if path == '/api/auth/logout':
            token = self.token()
            try:
                _, jwt = validate_session(token); forget_session(token)
                remote('/rest/v1/email_login_sessions?' + urllib.parse.urlencode({'session_id': 'eq.' + jwt['session_id'], 'user_id': 'eq.' + jwt['sub']}), 'DELETE', service=True)
            except APIError: pass
            return self.respond({'ok': True})
        body = self.json_body()
        if path == '/api/auth/refresh':
            refresh = body.get('refresh_token', '')
            if not isinstance(refresh, str) or not 10 < len(refresh) < 512: raise APIError('Sessão inválida.', 401)
            try: s = remote('/auth/v1/token?grant_type=refresh_token', 'POST', {'refresh_token': refresh})
            except APIError: raise APIError('Sessão expirada. Entre novamente.', 401) from None
            return self.respond({'access_token': s['access_token'], 'refresh_token': s['refresh_token'], 'expires_in': s.get('expires_in', 3600)})
        if path == '/api/auth/login':
            email = str(body.get('email', '')).strip().lower(); password = body.get('password', '')
            if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or not isinstance(password, str) or not password or len(password) > 1024:
                raise APIError('E-mail ou senha inválidos.', 401)
            try: session = remote('/auth/v1/token?grant_type=password', 'POST', {'email': email, 'password': password})
            except APIError as e:
                if e.status in (400, 401, 403, 422): raise APIError('E-mail ou senha inválidos.', 401) from None
                raise
            user = session['user']
            profiles = remote('/rest/v1/profiles?' + urllib.parse.urlencode({'id': 'eq.' + user['id'], 'select': 'id,email,active'}), service=True)
            if not profiles or not profiles[0]['active']: raise APIError('Conta sem acesso ao estoque.', 403)
            challenge = secrets.token_urlsafe(32); digest = hashlib.sha256(challenge.encode()).hexdigest()
            remote('/rest/v1/rpc/email_login_command', 'POST', {'action': 'begin', 'secret_hash': digest, 'uid': user['id'], 'email_address': user['email']}, service=True)
            remote('/auth/v1/otp', 'POST', {'email': user['email'], 'create_user': False})
            try: remote('/auth/v1/logout?scope=local', 'POST', token=session['access_token'])
            except APIError: pass
            return self.respond({'challenge': challenge, 'expiresIn': 600})
        if path == '/api/auth/verify':
            challenge = body.get('challenge', ''); code = body.get('code', '')
            if not isinstance(challenge, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', challenge) or not isinstance(code, str) or not re.fullmatch(r'(?:[0-9]{6}|[0-9]{8})', code):
                raise APIError('Informe o código completo enviado ao e-mail (6 ou 8 dígitos).')
            digest = hashlib.sha256(challenge.encode()).hexdigest()
            attempt = remote('/rest/v1/rpc/email_login_command', 'POST', {'action': 'attempt', 'secret_hash': digest}, service=True)
            try: session = remote('/auth/v1/verify', 'POST', {'email': attempt['email'], 'token': code, 'type': 'email'})
            except APIError as e:
                if e.status in (400, 401, 403, 422): raise APIError('Código inválido ou expirado. Confira seu e-mail.') from None
                raise
            user = remote('/auth/v1/user', token=session['access_token']); jwt = claims(session['access_token'])
            if user['id'] != attempt['user_id'] or jwt.get('sub') != user['id'] or not jwt.get('session_id'): raise APIError('Sessão inválida.', 403)
            remote('/rest/v1/rpc/email_login_command', 'POST', {'action': 'complete', 'secret_hash': digest, 'uid': user['id'], 'sid': jwt['session_id']}, service=True)
            return self.respond({'access_token': session['access_token'], 'refresh_token': session['refresh_token'], 'expires_in': session.get('expires_in', 3600)})
        raise APIError('Rota não encontrada.', 404)

    # ── leitura ──
    def get(self, path, qs, profile):
        t = self.auth_token
        if path == '/api/boot':
            f_products = _pool.submit(catalogue, t); f_pending = _pool.submit(pending_photos, t)
            return self.respond({'me': profile, 'products': f_products.result(), 'pending_photos': f_pending.result()})
        if path == '/api/products':
            return self.respond(catalogue(t))
        if re.fullmatch(r'/api/products/\d+', path):
            pid = integer(path.rsplit('/', 1)[1], 1)
            f_photos = _pool.submit(lambda: photo_rows(t, product_id='eq.' + str(pid), review_status='eq.confirmada', order='is_primary.desc,id.asc')[0])
            f_moves = _pool.submit(remote, '/rest/v1/movements?' + urllib.parse.urlencode({'product_id': 'eq.' + str(pid), 'order': 'id.desc', 'limit': 100}), token=t)
            found = remote('/rest/v1/products?' + urllib.parse.urlencode({'select': '*', 'id': 'eq.' + str(pid)}), token=t)
            if not found: raise APIError('Produto não encontrado.', 404)
            p = found[0]; p.pop('source_text', None); p['unit'] = quantity_unit(p)
            p['photos'] = [{k: ph[k] for k in ('id', 'filename', 'is_primary', 'url', 'thumb')} for ph in f_photos.result()]
            p['movements'] = f_moves.result()
            return self.respond(p)
        if path == '/api/review':
            status = qs.get('status', ['pendente'])[0]
            if status not in ('pendente', 'confirmada', 'oculta', 'todas'): raise APIError('Filtro inválido.')
            q = {'order': 'id.asc', 'limit': min(integer(qs.get('limit', [24])[0], 1), 100), 'offset': integer(qs.get('offset', [0])[0])}
            if status != 'todas': q['review_status'] = 'eq.' + status
            items, total = photo_rows(t, **q)
            return self.respond({'rows': items, 'total': total})
        if path == '/api/history':
            q = {'select': 'id,product_id,kind,amount,before_qty,after_qty,note,created_at,products(name)', 'order': 'id.desc', 'limit': min(integer(qs.get('limit', [300])[0], 1), 1000)}
            kind = qs.get('kind', [''])[0]
            if kind:
                if kind not in ('entrada', 'saida', 'ajuste', 'cadastro'): raise APIError('Filtro inválido.')
                q['kind'] = 'eq.' + kind
            data = remote('/rest/v1/movements?' + urllib.parse.urlencode(q), token=t)
            for r in data: r['product_name'] = (r.pop('products', None) or {}).get('name', 'Peça removida')
            return self.respond(data)
        if path == '/api/repairs':
            data = rows('repairs', t, select='id,name,category,quantity,defect,notes,status,photo_path,created_at,updated_at', archived_at='is.null', order='created_at.desc,id.desc')
            urls = sign_paths([r['photo_path'] for r in data], t)
            for r in data: r['photo'] = urls.get(r.pop('photo_path', None))
            return self.respond(data)
        if path == '/api/export.csv':
            out = io.StringIO(); w = csv.writer(out, delimiter=';')
            w.writerow(['ID', 'Nome', 'Categoria', 'Quantidade', 'Estoque mínimo', 'Observações', 'Atualizado em', 'Conferência'])
            for p in rows('products', t, select='id,name,category,quantity,min_quantity,notes,updated_at,review_status', order='name.asc,id.asc'):
                cells = [p[k] for k in ('id', 'name', 'category', 'quantity', 'min_quantity', 'notes', 'updated_at', 'review_status')]
                w.writerow(["'" + v if isinstance(v, str) and v.startswith(('=', '+', '-', '@', '\t', '\r')) else v for v in cells])
            return self.respond(('﻿' + out.getvalue()).encode(), ctype='text/csv; charset=utf-8', extra={'Content-Disposition': 'attachment; filename="estoque.csv"'})
        if path == '/api/backup':
            tables = dict(zip(['products', 'photos', 'movements', 'audit_log', 'repairs'], _pool.map(lambda n: rows(n, t, select='*'), ['products', 'photos', 'movements', 'audit_log', 'repairs'])))
            content = {'format': 'happy-machine-online-v1', 'created_at': datetime.now(timezone.utc).isoformat(), 'tables': tables}
            return self.respond(json.dumps(content, ensure_ascii=False).encode(), ctype='application/json', extra={'Content-Disposition': 'attachment; filename="estoque_online.json"'})
        raise APIError('Rota não encontrada.', 404)

    # ── escrita ──
    def store_photo(self, folder, photo, thumb):
        """Envia original e miniatura. Devolve (caminho, caminho_miniatura)."""
        name = secrets.token_hex(24); path = f"{folder}/{name}{PHOTO_TYPES[photo['mime']]}"; thumb_path = None
        remote('/storage/v1/object/stock-photos/' + path, 'POST', photo['data'], token=self.auth_token, headers={'Content-Type': photo['mime']})
        if thumb:
            thumb_path = f"thumbs/{name}{PHOTO_TYPES[thumb['mime']]}"
            try: remote('/storage/v1/object/stock-photos/' + thumb_path, 'POST', thumb['data'], token=self.auth_token, headers={'Content-Type': thumb['mime']})
            except APIError: thumb_path = None
        return path, thumb_path

    def drop_photos(self, *paths):
        paths = [p for p in paths if p]
        if paths:
            try: remote('/storage/v1/object/stock-photos', 'DELETE', {'prefixes': paths}, token=self.auth_token)
            except Exception: pass

    def post(self, path):
        t = self.auth_token
        if path == '/api/repairs' or re.fullmatch(r'/api/repairs/\d+/(update|archive)', path):
            archived = path.endswith('/archive')
            fields, photo, thumb = (self.json_body(), None, None) if archived else self.multipart()
            payload = {k: fields[k] for k in ('name', 'category', 'quantity', 'defect', 'notes', 'status', 'updated_at') if k in fields}
            if not archived:
                payload['quantity'] = integer(payload.get('quantity', 0), 1)
                if payload['quantity'] > 1000000: raise APIError('Quantidade muito grande.')
                if not str(payload.get('name', '')).strip() or len(payload['name']) > 160: raise APIError('Informe o nome da peça.')
                if not str(payload.get('defect', '')).strip() or len(payload['defect']) > 2000: raise APIError('Descreva o defeito em até 2000 caracteres.')
                if payload.get('status', 'aguardando') not in ('aguardando', 'em_conserto', 'consertada', 'sem_conserto'): raise APIError('Situação inválida.')
            action = 'create' if path == '/api/repairs' else 'archive' if archived else 'update'
            pid = None if action == 'create' else integer(path.split('/')[3], 1)
            uploaded = None
            try:
                if photo:
                    name = secrets.token_hex(24); uploaded = f"repairs/{name}{PHOTO_TYPES[photo['mime']]}"
                    remote('/storage/v1/object/stock-photos/' + uploaded, 'POST', photo['data'], service=True, headers={'Content-Type': photo['mime']})
                    payload.update(photo_path=uploaded, photo_mime=photo['mime'])
                result = remote('/rest/v1/rpc/repair_command', 'POST', {'command': action, 'pid': pid, 'payload': payload}, token=t)
            except Exception:
                if uploaded:
                    try: remote('/storage/v1/object/stock-photos', 'DELETE', {'prefixes': [uploaded]}, service=True)
                    except APIError: pass
                raise
            return self.respond(result, 201 if action == 'create' else 200)
        if path == '/api/products' or re.fullmatch(r'/api/products/\d+/update', path):
            fields, photo, thumb = self.multipart(); uploaded = (None, None)
            for k in ('quantity', 'min_quantity', 'existing_photo_id'):
                if k in fields: fields[k] = integer(fields[k], 1 if k == 'existing_photo_id' else 0)
            if not str(fields.get('name', '')).strip() or len(fields['name']) > 160: raise APIError('Informe um nome de até 160 caracteres.')
            if fields.get('existing_photo_id') and photo: raise APIError('Escolha apenas uma foto.')
            key = product_name_key(fields['name'])
            if not key: raise APIError('Informe um nome com letras ou números.')
            editing_id = None if path == '/api/products' else int(path.split('/')[3])
            match = next((p for p in rows('products', t, select='id,name', order='id.asc') if p['id'] != editing_id and product_name_key(p['name']) == key), None)
            if match: raise APIError(f'Esta peça já está cadastrada: {match["name"]} (#{match["id"]}). Abra o cadastro existente e use Entrada ou Ajustar para atualizar a quantidade.', 409)
            try:
                if photo:
                    uploaded = self.store_photo('uploads', photo, thumb)
                    fields['photo'] = {'filename': photo['filename'], 'mime': photo['mime'], 'storage_path': uploaded[0]}
                result = self.stock_command('create' if editing_id is None else 'update', editing_id, fields)
                if uploaded[1]:
                    try: remote('/rest/v1/photos?' + urllib.parse.urlencode({'storage_path': 'eq.' + uploaded[0]}), 'PATCH', {'thumb_path': uploaded[1]}, service=True)
                    except APIError: pass
                return self.respond(result, 201 if editing_id is None else 200)
            except Exception:
                self.drop_photos(*uploaded); raise
        if re.fullmatch(r'/api/products/\d+/(movement|confirm)', path):
            parts = path.split('/'); return self.respond(self.stock_command(parts[4], int(parts[3]), self.json_body()))
        if re.fullmatch(r'/api/photos/\d+/review', path):
            return self.respond(self.stock_command('review_photo', int(path.split('/')[3]), self.json_body()))
        raise APIError('Rota não encontrada.', 404)

    # ── administração ──
    def admin(self, method, path, profile):
        if path == '/api/admin/users' and method == 'GET':
            return self.respond(rows('profiles', self.auth_token, select='id,email,name,role,active,created_at', order='created_at.desc'))
        if path == '/api/admin/users' and method == 'POST':
            data = self.json_body(); email = str(data.get('email', '')).strip().lower(); name = str(data.get('name', '')).strip()[:100]
            if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email): raise APIError('Informe um e-mail válido.')
            password = secrets.token_urlsafe(24) + 'aA9!'
            user = remote('/auth/v1/admin/users', 'POST', {'email': email, 'password': password, 'email_confirm': True, 'user_metadata': {'name': name}}, service=True)
            uid = user['id']
            try:
                remote('/rest/v1/profiles', 'POST', {'id': uid, 'email': email, 'name': name, 'role': 'operator', 'active': True}, service=True)
                remote('/rest/v1/audit_log', 'POST', {'action': 'create_user', 'after_data': json.dumps({'id': uid, 'email': email}), 'actor_id': profile['id']}, service=True)
            except Exception:
                raise APIError('Não foi possível concluir o cadastro. A conta ainda não tem acesso.', 502)
            return self.respond({'ok': True, 'id': uid, 'email': email, 'password': password}, 201)
        if re.fullmatch(r'/api/admin/users/[0-9a-f-]{36}/active', path) and method == 'POST':
            uid = path.split('/')[4]; active = self.json_body().get('active')
            if not isinstance(active, bool): raise APIError('Situação inválida.')
            users = remote('/rest/v1/profiles?' + urllib.parse.urlencode({'id': 'eq.' + uid, 'select': 'role'}), service=True)
            if not users: raise APIError('Usuário não encontrado.', 404)
            if users[0]['role'] == 'admin': raise APIError('O administrador principal não pode ser desativado.')
            remote('/rest/v1/profiles?' + urllib.parse.urlencode({'id': 'eq.' + uid}), 'PATCH', {'active': active}, service=True)
            remote('/rest/v1/audit_log', 'POST', {'action': 'user_active', 'after_data': json.dumps({'id': uid, 'active': active}), 'actor_id': profile['id']}, service=True)
            return self.respond({'ok': True})
        raise APIError('Rota não encontrada.', 404)
