"""API do estoque Happy Machine (Vercel). O Supabase valida cada token; RLS e RPC exigem senha + e-mail.

Desempenho: conexões HTTPS reutilizadas, validação de sessão em paralelo e com cache curto,
consultas combinadas (produto + fotos numa só) e URLs assinadas de fotos em lote e em cache.
"""
import os, json, io, csv, re, time, base64, secrets, hashlib, hmac, threading, unicodedata
import http.client, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from email.parser import BytesParser
from email.policy import default

MAX_BODY = 4_000_000
GALPAO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'galpao')   # fotos das estantes (só com login)
SHELVES = ('',) + tuple('ABCDEFGHIJK')
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


def clean_text(value, limit):
    return re.sub(r'\s+', ' ', str(value or '')).strip()[:limit]


def movement_payload(body):
    """Entrada/saída precisam de origem/destino: uma pessoa (holder_id) ou um lugar/motivo (destination)."""
    kind = body.get('kind')
    out = {'kind': kind, 'note': clean_text(body.get('note'), 180)}
    if kind == 'ajuste':
        out['new_quantity'] = integer(body.get('new_quantity', ''))
        return out
    if kind not in ('entrada', 'saida'): raise APIError('Tipo de movimentação inválido.')
    out['amount'] = integer(body.get('amount', ''), 1)
    if body.get('holder_id') not in (None, ''):
        out['holder_id'] = integer(body['holder_id'], 1)
    else:
        out['destination'] = clean_text(body.get('destination'), 120)
        if not out['destination']: raise APIError('Informe para onde foi.' if kind == 'saida' else 'Informe de onde veio.')
    return out


def valid_image(mime, payload):
    return ((mime == 'image/jpeg' and payload.startswith(b'\xff\xd8\xff')) or
            (mime == 'image/png' and payload.startswith(b'\x89PNG\r\n\x1a\n')) or
            (mime == 'image/webp' and payload[:4] == b'RIFF' and payload[8:12] == b'WEBP') or
            (mime == 'image/gif' and payload[:6] in (b'GIF87a', b'GIF89a')))


PW_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'   # sem 0/O, 1/l/I: fácil de ler e digitar


def new_password():
    """Senha provisória legível: 4 blocos de 4 (ex.: Hq7m-2kPz-Rt4a-W9xe), com maiúscula, minúscula, número e símbolo."""
    while True:
        pw = '-'.join(''.join(secrets.choice(PW_CHARS) for _ in range(4)) for _ in range(4))
        if re.search(r'[A-Z]', pw) and re.search(r'[a-z]', pw) and re.search(r'\d', pw): return pw


def password_error(e):
    """Traduz a recusa de senha do Supabase (regras do painel: tamanho, símbolos, senha vazada)."""
    msg = (e.message or '').lower()
    if e.status in (400, 422) and ('password' in msg or 'weak' in msg):
        if 'pwned' in msg or 'leak' in msg or 'known' in msg: return APIError('Essa senha aparece em vazamentos conhecidos. Escolha outra.', 400)
        if 'character' in msg: return APIError('O Supabase exige mais tipos de caractere na senha (maiúscula, minúscula, número e símbolo). Escolha outra.', 400)
        if 'at least' in msg or 'length' in msg or 'short' in msg: return APIError('O Supabase exige uma senha mais longa. Escolha outra.', 400)
        return APIError('O Supabase recusou essa senha. Escolha outra.', 400)
    return e


# ───────────────────────── Cofre de senhas (só o administrador lê) ─────────────────────────
# Cópia cifrada da senha de cada usuário em app_settings (chave "senha:<id>"), que só o servidor lê.
# Cifra: HMAC-SHA256 em modo contador + HMAC de autenticação (só biblioteca padrão).
# A chave vem de PASSWORD_VAULT_KEY ou, se ela não existir, é derivada da chave de serviço do Supabase.
def _vault_keys():
    base = os.environ.get('PASSWORD_VAULT_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not base: raise APIError('Administração não configurada.', 503)
    root = hashlib.sha256(b'happy-estoque/cofre-senhas/v1|' + base.encode()).digest()
    return hmac.new(root, b'enc', hashlib.sha256).digest(), hmac.new(root, b'mac', hashlib.sha256).digest()


def _stream(key, nonce, n):
    out = b''; i = 0
    while len(out) < n:
        out += hmac.new(key, nonce + i.to_bytes(4, 'big'), hashlib.sha256).digest(); i += 1
    return out[:n]


def vault_seal(text):
    ke, km = _vault_keys(); nonce = secrets.token_bytes(16); data = text.encode()
    ct = bytes(a ^ b for a, b in zip(data, _stream(ke, nonce, len(data))))
    tag = hmac.new(km, b'v1' + nonce + ct, hashlib.sha256).digest()
    return 'v1.' + base64.urlsafe_b64encode(nonce + ct + tag).decode()


def vault_open(token):
    try:
        ver, _, b64 = str(token).partition('.'); raw = base64.urlsafe_b64decode(b64)
        if ver != 'v1' or len(raw) < 48: return None
        ke, km = _vault_keys(); nonce, ct, tag = raw[:16], raw[16:-32], raw[-32:]
        if not hmac.compare_digest(tag, hmac.new(km, b'v1' + nonce + ct, hashlib.sha256).digest()): return None
        return bytes(a ^ b for a, b in zip(ct, _stream(ke, nonce, len(ct)))).decode()
    except (ValueError, UnicodeError): return None


def vault_put(uid, password):
    """Guarda (ou apaga, com password=None) a cópia cifrada. Nunca derruba a troca de senha."""
    key = 'senha:' + uid
    try:
        if password is None: remote('/rest/v1/app_settings?' + urllib.parse.urlencode({'key': 'eq.' + key}), 'DELETE', service=True)
        else: remote('/rest/v1/app_settings?on_conflict=key', 'POST', {'key': key, 'value': {'v': vault_seal(password), 'at': datetime.now(timezone.utc).isoformat()}},
                     service=True, headers={'Prefer': 'resolution=merge-duplicates'})
        return True
    except APIError: return False


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


# ───────────────────────── Galpão: onde cada estante está no panorama ─────────────────────────
def galpao_layout():
    """Marcações salvas pelo administrador (None = usar as marcações padrão do site)."""
    try: r = remote('/rest/v1/app_settings?' + urllib.parse.urlencode({'key': 'eq.galpao_layout', 'select': 'value'}), service=True)
    except APIError: return None
    return r[0]['value'] if r else None


def save_galpao_layout(body, actor):
    shelves = body.get('shelves') if isinstance(body, dict) else None
    if not isinstance(shelves, dict) or set(shelves) - set(SHELVES[1:]): raise APIError('Marcações inválidas.')
    clean = {}
    for k, rects in shelves.items():
        if not isinstance(rects, list) or len(rects) > 4: raise APIError('Marcações inválidas.')
        out = []
        for r in rects:
            if not isinstance(r, list) or len(r) != 4 or not all(isinstance(v, (int, float)) and 0 <= v <= 100 for v in r): raise APIError('Marcações inválidas.')
            x, y, w, h = (round(float(v), 2) for v in r)
            if w < .5 or h < .5 or x + w > 100.01 or y + h > 100.01: raise APIError('Marcações inválidas.')
            out.append([x, y, w, h])
        if out: clean[k] = out
    value = {'v': 1, 'shelves': clean}
    try:
        remote('/rest/v1/app_settings?on_conflict=key', 'POST', {'key': 'galpao_layout', 'value': value}, service=True, headers={'Prefer': 'resolution=merge-duplicates'})
    except APIError: raise APIError('Rode a migração 020 no Supabase para salvar as marcações.', 503) from None
    try: remote('/rest/v1/audit_log', 'POST', {'action': 'galpao_layout', 'after_data': json.dumps({'estantes': sorted(clean)}), 'actor_id': actor}, service=True)
    except APIError: pass
    return {'ok': True, 'layout': value}


# ───────────────────────── Logs de acesso ─────────────────────────
def device_name(ua):
    """Nome curto e legível do aparelho a partir do User-Agent: "iPhone · Safari", "Windows · Chrome"."""
    ua = ua or ''
    if not ua: return 'Desconhecido'
    if re.search(r'bot|crawl|spider|curl|python|wget|headless', ua, re.I): return 'Robô / script'
    m = re.search(r'Android[^;)]*;\s*([^;)]+?)(?:\s+Build|\))', ua)
    if 'iPhone' in ua: osn = 'iPhone'
    elif 'iPad' in ua or ('Macintosh' in ua and 'Mobile' in ua): osn = 'iPad'
    elif 'Android' in ua:
        model = m.group(1).strip() if m else ''
        osn = 'Android' + (f' ({model})' if model and model.upper() not in ('K', 'MOBILE', 'WV') else '')
    elif 'Windows' in ua: osn = 'Windows'
    elif 'Mac OS X' in ua or 'Macintosh' in ua: osn = 'Mac'
    elif 'CrOS' in ua: osn = 'Chromebook'
    elif 'Linux' in ua: osn = 'Linux'
    else: osn = 'Outro'
    for pat, name in ((r'Edg(?:e|A|iOS)?/', 'Edge'), (r'OPR/|Opera', 'Opera'), (r'SamsungBrowser/', 'Samsung Internet'), (r'Firefox/|FxiOS/', 'Firefox'),
                      (r'CriOS/|Chrome/', 'Chrome'), (r'Safari/', 'Safari')):
        if re.search(pat, ua): return f'{osn} · {name}'
    return osn


def log_access(handler, event, user_id=None, email='', ok=True, session_id='', detail=''):
    """Grava um evento de acesso. Nunca derruba a requisição (a tabela pode ainda não existir)."""
    h = handler.headers
    ip = (h.get('X-Forwarded-For') or '').split(',')[0].strip() or h.get('X-Real-IP', '') or (handler.client_address[0] if getattr(handler, 'client_address', None) else '')
    q = lambda k: urllib.parse.unquote(h.get(k, '') or '')
    place = ', '.join(x for x in (q('X-Vercel-IP-City'), q('X-Vercel-IP-Country-Region'), q('X-Vercel-IP-Country')) if x)
    ua = (h.get('User-Agent') or '')[:400]
    row = {'event': event, 'ok': ok, 'user_id': user_id, 'email': (email or '')[:200], 'ip': ip[:64], 'place': place[:120], 'device': device_name(ua),
           'user_agent': ua, 'session_id': str(session_id or '')[:64], 'detail': (detail or '')[:300]}
    try: remote('/rest/v1/access_log', 'POST', row, service=True)
    except Exception: pass


_opened = {}
def opened_recently(session_id):
    """Evita um registro de "abriu o site" a cada recarga: no máximo um a cada 10 min por sessão."""
    now = time.time()
    with _sessions_lock:
        if _opened.get(session_id, 0) > now:
            return True
        if len(_opened) > 512:
            for k in [k for k, v in _opened.items() if v <= now]: _opened.pop(k, None)
        _opened[session_id] = now + 600
    return False


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
    def fetch(embed, loc=True):
        return rows('products', token, select='id,name,category,quantity,min_quantity,notes,review_status,updated_at,' + ('location,' if loc else '') + embed,
                    **{'order': 'name.asc,id.asc', 'photos.review_status': 'eq.confirmada', 'photos.order': 'is_primary.desc,id.asc'})
    tries = ((PHOTO_EMBED, True), (PHOTO_EMBED, False), (PHOTO_EMBED_BASIC, False))   # 019 / 017 ainda não aplicadas
    for i, args in enumerate(tries):
        try: items = fetch(*args); break
        except APIError as e:
            if e.status != 400 or i == len(tries) - 1: raise
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
        p['notes'] = (p.get('notes') or '')[:220]; p.setdefault('location', '')
    return firsts


def holders(token):
    """Pessoas e o que cada uma tem. Lista vazia se a migração 018 ainda não foi aplicada."""
    try:
        people = rows('holders', token, select='id,name,active,created_at', order='name.asc,id.asc')
        stock = rows('holder_stock', token, select='holder_id,product_id,quantity,updated_at', quantity='gt.0', order='holder_id.asc,product_id.asc')
    except APIError as e:
        if e.status in (400, 404): return []
        raise
    by = {h['id']: dict(h, items=[]) for h in people}
    for s in stock:
        if s['holder_id'] in by: by[s['holder_id']]['items'].append({k: s[k] for k in ('product_id', 'quantity', 'updated_at')})
    return list(by.values())


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

    def respond(self, obj, status=200, ctype='application/json; charset=utf-8', extra=None, cache='private, no-store'):
        data = obj if isinstance(obj, bytes) else json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
        self.send_response(status)
        self.send_header('Content-Type', ctype); self.send_header('Cache-Control', cache)
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
            if path.startswith('/api/account/') and method == 'POST': return self.account(path, profile, jwt)
            if path.startswith('/api/admin/'):
                if profile['role'] != 'admin': raise APIError('Acesso restrito ao administrador.', 403)
                return self.admin(method, path, profile)
            if path == '/api/galpao/layout' and method == 'POST':
                if profile['role'] != 'admin': raise APIError('Só o administrador ajusta as marcações do galpão.', 403)
                return self.respond(save_galpao_layout(self.json_body(), profile['id']))
            if method == 'POST' and re.fullmatch(r'/api/products/\d+/location', path) and profile['role'] != 'admin':
                raise APIError('Só o administrador muda a estante das peças.', 403)
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
                prof, jwt = validate_session(token); forget_session(token)
                remote('/rest/v1/email_login_sessions?' + urllib.parse.urlencode({'session_id': 'eq.' + jwt['session_id'], 'user_id': 'eq.' + jwt['sub']}), 'DELETE', service=True)
                log_access(self, 'saiu', jwt['sub'], prof.get('email', ''), session_id=jwt['session_id'])
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
                if e.status in (400, 401, 403, 422):
                    log_access(self, 'senha_errada', None, email, ok=False); raise APIError('E-mail ou senha inválidos.', 401) from None
                if e.status == 429: log_access(self, 'bloqueado', None, email, ok=False, detail='Muitas tentativas')
                raise
            user = session['user']
            profiles = remote('/rest/v1/profiles?' + urllib.parse.urlencode({'id': 'eq.' + user['id'], 'select': 'id,email,active'}), service=True)
            if not profiles or not profiles[0]['active']:
                log_access(self, 'sem_acesso', user['id'], email, ok=False, detail='Conta desativada'); raise APIError('Conta sem acesso ao estoque.', 403)
            challenge = secrets.token_urlsafe(32); digest = hashlib.sha256(challenge.encode()).hexdigest()
            remote('/rest/v1/rpc/email_login_command', 'POST', {'action': 'begin', 'secret_hash': digest, 'uid': user['id'], 'email_address': user['email']}, service=True)
            remote('/auth/v1/otp', 'POST', {'email': user['email'], 'create_user': False})
            try: remote('/auth/v1/logout?scope=local', 'POST', token=session['access_token'])
            except APIError: pass
            log_access(self, 'senha_ok', user['id'], user['email'], detail='Código enviado por e-mail')
            return self.respond({'challenge': challenge, 'expiresIn': 600})
        if path == '/api/auth/verify':
            challenge = body.get('challenge', ''); code = body.get('code', '')
            if not isinstance(challenge, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', challenge) or not isinstance(code, str) or not re.fullmatch(r'(?:[0-9]{6}|[0-9]{8})', code):
                raise APIError('Informe o código completo enviado ao e-mail (6 ou 8 dígitos).')
            digest = hashlib.sha256(challenge.encode()).hexdigest()
            attempt = remote('/rest/v1/rpc/email_login_command', 'POST', {'action': 'attempt', 'secret_hash': digest}, service=True)
            try: session = remote('/auth/v1/verify', 'POST', {'email': attempt['email'], 'token': code, 'type': 'email'})
            except APIError as e:
                if e.status in (400, 401, 403, 422):
                    log_access(self, 'codigo_errado', attempt.get('user_id'), attempt.get('email', ''), ok=False); raise APIError('Código inválido ou expirado. Confira seu e-mail.') from None
                raise
            user = remote('/auth/v1/user', token=session['access_token']); jwt = claims(session['access_token'])
            if user['id'] != attempt['user_id'] or jwt.get('sub') != user['id'] or not jwt.get('session_id'): raise APIError('Sessão inválida.', 403)
            remote('/rest/v1/rpc/email_login_command', 'POST', {'action': 'complete', 'secret_hash': digest, 'uid': user['id'], 'sid': jwt['session_id']}, service=True)
            log_access(self, 'entrou', user['id'], attempt.get('email', ''), session_id=jwt['session_id'])
            return self.respond({'access_token': session['access_token'], 'refresh_token': session['refresh_token'], 'expires_in': session.get('expires_in', 3600)})
        raise APIError('Rota não encontrada.', 404)

    # ── leitura ──
    def get(self, path, qs, profile):
        t = self.auth_token
        if path == '/api/boot':
            sid = str(claims(t).get('session_id', ''))
            if sid and not opened_recently(sid): log_access(self, 'abriu', profile['id'], profile.get('email', ''), session_id=sid)
            f_products = _pool.submit(catalogue, t); f_pending = _pool.submit(pending_photos, t); f_holders = _pool.submit(holders, t)
            return self.respond({'me': profile, 'products': f_products.result(), 'pending_photos': f_pending.result(), 'holders': f_holders.result()})
        if path == '/api/holders':
            return self.respond(holders(t))
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
        if path.startswith('/api/galpao/') and profile['role'] != 'admin':
            raise APIError('O Galpão está liberado só para o administrador por enquanto.', 403)
        if path == '/api/galpao/layout':
            return self.respond({'layout': galpao_layout()})
        if re.fullmatch(r'/api/galpao/t?(?:[A-K]\d{1,2}|pano)\.jpg', path):
            f = os.path.join(GALPAO, path.rsplit('/', 1)[1])
            if not os.path.isfile(f): raise APIError('Foto não encontrada.', 404)
            with open(f, 'rb') as fh: return self.respond(fh.read(), ctype='image/jpeg', cache='private, max-age=604800')
        if path == '/api/review':
            status = qs.get('status', ['pendente'])[0]
            if status not in ('pendente', 'confirmada', 'oculta', 'todas'): raise APIError('Filtro inválido.')
            q = {'order': 'id.asc', 'limit': min(integer(qs.get('limit', [24])[0], 1), 100), 'offset': integer(qs.get('offset', [0])[0])}
            if status != 'todas': q['review_status'] = 'eq.' + status
            items, total = photo_rows(t, **q)
            return self.respond({'rows': items, 'total': total})
        if path == '/api/history':
            q = {'select': 'id,product_id,kind,amount,before_qty,after_qty,note,created_at,holder_id,destination,products(name)', 'order': 'id.desc', 'limit': min(integer(qs.get('limit', [300])[0], 1), 1000)}
            kind = qs.get('kind', [''])[0]
            if kind:
                if kind not in ('entrada', 'saida', 'ajuste', 'cadastro', 'consumo'): raise APIError('Filtro inválido.')
                q['kind'] = 'eq.' + kind
            holder = qs.get('holder', [''])[0]
            if holder: q['holder_id'] = 'eq.' + str(integer(holder, 1))
            try: data = remote('/rest/v1/movements?' + urllib.parse.urlencode(q), token=t)
            except APIError as e:
                if e.status != 400 or holder: raise
                q['select'] = 'id,product_id,kind,amount,before_qty,after_qty,note,created_at,products(name)'   # migração 018 ainda não aplicada
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
            names = ['products', 'photos', 'movements', 'audit_log', 'repairs', 'holders', 'holder_stock']
            def dump(n):
                try: return rows(n, t, select='*')
                except APIError as e:
                    if n.startswith('holder') and e.status in (400, 404): return []
                    raise
            tables = dict(zip(names, _pool.map(dump, names)))
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
        if re.fullmatch(r'/api/products/\d+/location', path):
            pid = int(path.split('/')[3]); loc = str(self.json_body().get('location', '')).strip().upper()
            if loc not in SHELVES: raise APIError('Estante inválida.')
            found = remote('/rest/v1/products?' + urllib.parse.urlencode({'select': 'id,name,location', 'id': 'eq.' + str(pid)}), token=t)
            if not found: raise APIError('Produto não encontrado.', 404)
            before = found[0].get('location', '')
            if before != loc:
                remote('/rest/v1/products?' + urllib.parse.urlencode({'id': 'eq.' + str(pid)}), 'PATCH', {'location': loc}, service=True)
                try: remote('/rest/v1/audit_log', 'POST', {'product_id': pid, 'action': 'location', 'before_data': before, 'after_data': loc, 'actor_id': claims(t).get('sub')}, service=True)
                except APIError: pass
            return self.respond({'id': pid, 'location': loc})
        if re.fullmatch(r'/api/products/\d+/(movement|confirm)', path):
            parts = path.split('/'); body = self.json_body()
            if parts[4] == 'movement': body = movement_payload(body)
            return self.respond(self.stock_command(parts[4], int(parts[3]), body))
        if path == '/api/holders':
            name = str(self.json_body().get('name', '')).strip()
            if not 1 <= len(name) <= 80: raise APIError('Informe o nome da pessoa (até 80 letras).')
            return self.respond(self.stock_command('holder_create', None, {'name': name}), 201)
        if re.fullmatch(r'/api/holders/\d+/update', path):
            body = self.json_body(); payload = {}
            if 'name' in body:
                payload['name'] = str(body['name']).strip()
                if not 1 <= len(payload['name']) <= 80: raise APIError('Informe o nome da pessoa (até 80 letras).')
            if 'active' in body:
                if not isinstance(body['active'], bool): raise APIError('Situação inválida.')
                payload['active'] = body['active']
            return self.respond(self.stock_command('holder_update', int(path.split('/')[3]), payload))
        if re.fullmatch(r'/api/holders/\d+/consume', path):
            body = self.json_body(); pid = integer(body.get('product_id', ''), 1)
            payload = {'holder_id': int(path.split('/')[3]), 'amount': integer(body.get('amount', ''), 1), 'destination': clean_text(body.get('destination'), 120), 'note': clean_text(body.get('note'), 180)}
            if not payload['destination']: raise APIError('Informe onde a peça foi usada.')
            return self.respond(self.stock_command('holder_consume', pid, payload))
        if re.fullmatch(r'/api/photos/\d+/review', path):
            return self.respond(self.stock_command('review_photo', int(path.split('/')[3]), self.json_body()))
        raise APIError('Rota não encontrada.', 404)

    # ── administração ──
    def account(self, path, profile, jwt):
        """Minha conta: nome, senha, sair dos outros aparelhos e excluir a própria conta."""
        data = self.json_body(); me = profile['id']
        def audit(action, info):
            try: remote('/rest/v1/audit_log', 'POST', {'action': action, 'after_data': json.dumps(info), 'actor_id': me}, service=True)
            except APIError: pass
        def check_password():
            pw = str(data.get('password', ''))
            if not pw: raise APIError('Digite sua senha atual.')
            try: s = remote('/auth/v1/token?grant_type=password', 'POST', {'email': profile['email'], 'password': pw})
            except APIError as e:
                raise APIError(e.message if e.status == 429 else 'Senha atual incorreta.', 429 if e.status == 429 else 400) from None
            try: remote('/auth/v1/logout?scope=local', 'POST', token=s['access_token'])
            except (APIError, KeyError): pass
        def logout_others():
            # apagar as sessões confirmadas por e-mail é o que corta o acesso; o logout do Supabase é extra
            remote('/rest/v1/email_login_sessions?' + urllib.parse.urlencode({'user_id': 'eq.' + me, 'session_id': 'neq.' + str(jwt.get('session_id', ''))}), 'DELETE', service=True)
            try: remote('/auth/v1/logout?scope=others', 'POST', token=self.auth_token)
            except APIError: pass
        if path == '/api/account/profile':
            name = clean_text(data.get('name'), 100)
            if len(name) < 2: raise APIError('Digite seu nome.')
            remote('/rest/v1/profiles?' + urllib.parse.urlencode({'id': 'eq.' + me}), 'PATCH', {'name': name}, service=True)
            forget_session(self.auth_token)
            return self.respond({'ok': True, 'name': name})
        if path == '/api/account/password':
            new = str(data.get('new_password', ''))
            if len(new) < 16 or len(new) > 72 or not re.search(r'[A-Za-z]', new) or not re.search(r'\d', new):
                raise APIError('A nova senha precisa ter de 16 a 72 caracteres, com letras e números.')
            if new == str(data.get('password', '')): raise APIError('A nova senha precisa ser diferente da atual.')
            check_password()
            try: remote('/auth/v1/admin/users/' + me, 'PUT', {'password': new}, service=True)
            except APIError as e: raise password_error(e) from None
            if profile['role'] != 'admin': vault_put(me, new)
            logout_others()   # quem tinha a senha antiga perde o acesso nos outros aparelhos
            audit('change_password', {'id': me}); log_access(self, 'senha_alterada', me, profile['email'], session_id=jwt.get('session_id', ''))
            return self.respond({'ok': True})
        if path == '/api/account/logout-others':
            logout_others()
            audit('logout_others', {'id': me}); log_access(self, 'saiu_outros', me, profile['email'], session_id=jwt.get('session_id', ''))
            return self.respond({'ok': True})
        if path == '/api/account/delete':
            if profile['role'] == 'admin': raise APIError('A conta do administrador principal não pode ser excluída.')
            if str(data.get('confirm', '')).strip().upper() != 'EXCLUIR': raise APIError('Digite EXCLUIR para confirmar.')
            check_password()
            audit('delete_account', {'id': me, 'email': profile['email']}); log_access(self, 'conta_excluida', me, profile['email'])
            remote('/auth/v1/admin/users/' + me, 'DELETE', service=True)
            vault_put(me, None)
            forget_session(self.auth_token)
            return self.respond({'ok': True})
        raise APIError('Rota não encontrada.', 404)

    def admin(self, method, path, profile):
        if path == '/api/admin/users' and method == 'GET':
            return self.respond(rows('profiles', self.auth_token, select='id,email,name,role,active,created_at', order='created_at.desc'))
        if path == '/api/admin/users' and method == 'POST':
            data = self.json_body(); email = str(data.get('email', '')).strip().lower(); name = str(data.get('name', '')).strip()[:100]
            if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email): raise APIError('Informe um e-mail válido.')
            password = new_password()
            try: user = remote('/auth/v1/admin/users', 'POST', {'email': email, 'password': password, 'email_confirm': True, 'user_metadata': {'name': name}}, service=True)
            except APIError as e:
                if e.status == 422 and 'already' in (e.message or '').lower(): raise APIError('Já existe uma conta com este e-mail.', 409) from None
                raise password_error(e) from None
            uid = user['id']
            try:
                remote('/rest/v1/profiles', 'POST', {'id': uid, 'email': email, 'name': name, 'role': 'operator', 'active': True}, service=True)
                vault_put(uid, password)
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
        if re.fullmatch(r'/api/admin/users/[0-9a-f-]{36}/password', path) and method == 'POST':
            uid = path.split('/')[4]; chosen = self.json_body().get('password')
            if chosen not in (None, ''):
                chosen = str(chosen)
                if len(chosen) < 16 or len(chosen) > 72 or not re.search(r'[A-Za-z]', chosen) or not re.search(r'\d', chosen):
                    raise APIError('A senha precisa ter de 16 a 72 caracteres, com letras e números.')
            users = remote('/rest/v1/profiles?' + urllib.parse.urlencode({'id': 'eq.' + uid, 'select': 'id,email,name,role'}), service=True)
            if not users: raise APIError('Usuário não encontrado.', 404)
            if users[0]['role'] == 'admin': raise APIError('Troque a senha do administrador em Configurações.')
            return self.respond(self.reset_password(users[0], profile['id'], chosen or None))
        if path == '/api/admin/users/reset-all' and method == 'POST':
            users = remote('/rest/v1/profiles?' + urllib.parse.urlencode({'select': 'id,email,name,role', 'role': 'neq.admin', 'order': 'name.asc'}), service=True) or []
            out = []
            for u in users:
                try: out.append(self.reset_password(u, profile['id']))
                except APIError as e: out.append({'ok': False, 'email': u['email'], 'name': u.get('name', ''), 'error': e.message})
            return self.respond({'results': out})
        if path == '/api/admin/passwords' and method == 'GET':
            try: rows_ = remote('/rest/v1/app_settings?' + urllib.parse.urlencode({'key': 'like.senha:*', 'select': 'key,value'}), service=True) or []
            except APIError: raise APIError('Rode a migração 020 no Supabase para guardar as senhas.', 503) from None
            out = {}
            for r in rows_:
                v = r.get('value') or {}; pw = vault_open(v.get('v', ''))
                if pw is not None: out[r['key'][6:]] = {'password': pw, 'at': v.get('at', '')}
            try: remote('/rest/v1/audit_log', 'POST', {'action': 'view_passwords', 'after_data': json.dumps({'total': len(out)}), 'actor_id': profile['id']}, service=True)
            except APIError: pass
            return self.respond(out)
        if path == '/api/admin/logs' and method == 'GET':
            return self.respond(self.logs())
        raise APIError('Rota não encontrada.', 404)

    def reset_password(self, user, actor, password=None):
        """Troca a senha de um usuário (gerada ou escolhida pelo admin) e o desconecta de todos os aparelhos."""
        password = password or new_password()
        try: remote('/auth/v1/admin/users/' + user['id'], 'PUT', {'password': password}, service=True)
        except APIError as e: raise password_error(e) from None
        remote('/rest/v1/email_login_sessions?' + urllib.parse.urlencode({'user_id': 'eq.' + user['id']}), 'DELETE', service=True)
        vault_put(user['id'], password)
        try: remote('/rest/v1/audit_log', 'POST', {'action': 'reset_password', 'after_data': json.dumps({'id': user['id'], 'email': user['email']}), 'actor_id': actor}, service=True)
        except APIError: pass
        return {'ok': True, 'email': user['email'], 'name': user.get('name', ''), 'password': password}

    def logs(self):
        """Página de logs (só administrador): acessos com conta e aparelho + alterações importantes."""
        f_access = _pool.submit(remote, '/rest/v1/access_log?' + urllib.parse.urlencode({'select': 'id,created_at,user_id,email,event,ok,ip,place,device,user_agent,session_id,detail', 'order': 'id.desc', 'limit': '1500'}), service=True)
        f_audit = _pool.submit(remote, '/rest/v1/audit_log?' + urllib.parse.urlencode({'select': 'id,created_at,product_id,action,before_data,after_data,actor_id', 'order': 'id.desc', 'limit': '600'}), service=True)
        f_users = _pool.submit(remote, '/rest/v1/profiles?' + urllib.parse.urlencode({'select': 'id,email,name,role,active'}), service=True)
        f_names = _pool.submit(remote, '/rest/v1/products?' + urllib.parse.urlencode({'select': 'id,name', 'limit': '5000'}), service=True)
        try: access, ready = f_access.result() or [], True
        except APIError: access, ready = [], False        # migration 020 ainda não rodou
        audit = f_audit.result() or []
        names = {p['id']: p['name'] for p in (f_names.result() or [])}
        for a in audit:
            a['product_name'] = names.get(a.get('product_id'), '')
            for k in ('before_data', 'after_data'): a[k] = (a.get(k) or '')[:600]
        return {'ready': ready, 'access': access, 'audit': audit, 'users': f_users.result() or []}
