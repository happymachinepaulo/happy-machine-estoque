"""Supabase simulado em memória. Usado nos testes e na pré-visualização local (scripts/preview.py).
Responde só às rotas que api/index.py usa; não substitui testes de RLS no Supabase real."""
import json, re, secrets, urllib.parse, base64

UID = '11111111-1111-4111-8111-111111111111'


def fake_jwt(sub=UID):
    body = base64.urlsafe_b64encode(json.dumps({'sub': sub, 'exp': 4102444800, 'session_id': 'demo-session'}).encode()).decode().rstrip('=')
    return 'h.' + body + '.s'


class Fake:
    def __init__(self, products=None, photos=None, role='admin'):
        self.profile = {'id': UID, 'email': 'demo@happymachine.test', 'name': 'Demonstração', 'role': role, 'active': True}
        self.products = products or []
        self.photos = photos or []
        self.movements, self.repairs, self.calls, self.uploads = [], [], [], {}
        self.seq = {'p': max([p['id'] for p in self.products] or [0]) + 1, 'ph': max([p['id'] for p in self.photos] or [0]) + 1, 'm': 1, 'r': 1}

    # ── utilidades ──
    @staticmethod
    def _qs(path):
        u = urllib.parse.urlsplit(path)
        return u.path, {k: v[0] for k, v in urllib.parse.parse_qs(u.query, keep_blank_values=True).items()}

    @staticmethod
    def _filter(rows, qs):
        for k, v in qs.items():
            if k in ('select', 'order', 'limit', 'offset') or '.' in k: continue
            op, _, val = v.partition('.')
            if op == 'eq': rows = [r for r in rows if str(r.get(k)) == val]
            elif op == 'is' and val == 'null': rows = [r for r in rows if r.get(k) is None]
            elif op == 'in': rows = [r for r in rows if str(r.get(k)) in val.strip('()').split(',')]
        return rows

    @staticmethod
    def _order(rows, qs):
        for spec in reversed(qs.get('order', '').split(',')):
            if not spec: continue
            col, _, d = spec.partition('.')
            rows = sorted(rows, key=lambda r: (r.get(col) is None, r.get(col) if r.get(col) is not None else 0), reverse=d == 'desc')
        return rows

    def _page(self, rows, qs):
        o, n = int(qs.get('offset', 0)), int(qs.get('limit', 1000))
        return rows[o:o + n]

    def thumb(self, ph):
        return ph.get('thumb_path')

    # ── a "chamada remota" ──
    def remote(self, path, method='GET', data=None, token=None, service=False, raw=False, headers=None, count=False):
        p, qs = self._qs(path); self.calls.append((method, p))
        if isinstance(data, (bytes, bytearray)):
            self.uploads[p] = bytes(data); return None
        if p == '/auth/v1/user': return {'id': UID}
        if p == '/rest/v1/rpc/stock_access': return True
        if p == '/auth/v1/token':
            if qs.get('grant_type') == 'refresh_token': return {'access_token': fake_jwt(), 'refresh_token': 'r' * 20, 'expires_in': 3600}
            return {'user': {'id': UID, 'email': self.profile['email']}, 'access_token': fake_jwt()}
        if p == '/rest/v1/rpc/email_login_command':
            return {'user_id': UID, 'email': self.profile['email']} if data['action'] == 'attempt' else {'ok': True}
        if p in ('/auth/v1/otp', '/auth/v1/logout'): return {}
        if p == '/auth/v1/verify':
            if data.get('token') != '000000': from api_index import APIError; raise APIError('Código inválido', 400)
            return {'access_token': fake_jwt(), 'refresh_token': 'r' * 20, 'expires_in': 3600}
        if p == '/rest/v1/profiles': return [self.profile]
        if p == '/storage/v1/object/sign/stock-photos':
            return [{'path': x, 'signedURL': f'/object/sign/stock-photos/{x}?token=t'} for x in data['paths']]
        if p == '/storage/v1/object/stock-photos' and method == 'DELETE': return {}
        if p == '/rest/v1/products':
            rows = self._filter(self.products, qs)
            rows = [dict(r) for r in self._page(self._order(rows, qs), qs)]
            if 'photos(' in qs.get('select', ''):
                for r in rows:
                    r['photos'] = [{'id': ph['id'], 'is_primary': ph['is_primary'], 'storage_path': ph['storage_path'], 'thumb_path': ph.get('thumb_path')}
                                   for ph in sorted(self.photos, key=lambda x: (-x['is_primary'], x['id'])) if ph['product_id'] == r['id'] and ph['review_status'] == 'confirmada']
            return rows
        if p == '/rest/v1/photos':
            rows = self._order(self._filter(self.photos, qs), qs); total = len(rows)
            out = [dict(r) for r in self._page(rows, qs)]
            if 'products(' in qs.get('select', ''):
                names = {x['id']: x['name'] for x in self.products}
                for r in out: r['products'] = {'name': names[r['product_id']]} if r.get('product_id') in names else None
            return (out, total) if count else out
        if p == '/rest/v1/movements':
            names = {x['id']: x['name'] for x in self.products}
            rows = self._page(self._order(self._filter(self.movements, qs), qs), qs)
            return [{**r, 'products': {'name': names.get(r['product_id'], 'Peça removida')}} for r in rows]
        if p == '/rest/v1/repairs': return [dict(r) for r in self._page(self._order(self._filter(self.repairs, qs), qs), qs)]
        if p == '/rest/v1/rpc/stock_command': return self.stock_command(data['command'], data['pid'], data['payload'])
        if p == '/rest/v1/rpc/repair_command': return self.repair_command(data['command'], data['pid'], data['payload'])
        raise AssertionError(f'Rota não simulada: {method} {path}')

    def _move(self, pid, kind, amount, before, after, note=''):
        self.movements.append({'id': self.seq['m'], 'product_id': pid, 'kind': kind, 'amount': amount, 'before_qty': before, 'after_qty': after, 'note': note, 'created_at': '2026-10-23T12:00:00+00:00'})
        self.seq['m'] += 1

    def stock_command(self, cmd, pid, pl):
        from api_index import APIError
        by = {p['id']: p for p in self.products}
        if cmd == 'create':
            p = {'id': self.seq['p'], 'name': pl['name'].strip(), 'category': pl.get('category', ''), 'quantity': pl.get('quantity', 0), 'min_quantity': pl.get('min_quantity', 0),
                 'notes': pl.get('notes', ''), 'source_text': '', 'review_status': 'confirmado', 'updated_at': '2026-10-23T12:00:00+00:00', 'created_at': '2026-10-23T12:00:00+00:00'}
            self.seq['p'] += 1; self.products.append(p); self._move(p['id'], 'cadastro', p['quantity'], 0, p['quantity'], 'Cadastro do item')
            if pl.get('existing_photo_id'):
                ph = next(x for x in self.photos if x['id'] == pl['existing_photo_id']); ph.update(product_id=p['id'], review_status='confirmada', is_primary=1)
            self._attach(p['id'], pl); return {'ok': True, 'id': p['id']}
        if cmd == 'review_photo':
            ph = next(x for x in self.photos if x['id'] == pid); st = pl['status']
            if st == 'confirmada':
                target = pl['product_id']
                if pl.get('primary', True):
                    for x in self.photos:
                        if x['product_id'] == target: x['is_primary'] = 0
                ph.update(product_id=target, review_status=st, is_primary=1 if pl.get('primary', True) else 0)
            else: ph.update(review_status=st, is_primary=0)
            return {'ok': True}
        p = by.get(pid)
        if not p: raise APIError('Produto não encontrado', 400)
        if cmd == 'movement':
            before = p['quantity']; k = pl['kind']
            after = pl['new_quantity'] if k == 'ajuste' else before + (pl['amount'] if k == 'entrada' else -pl['amount'])
            if after < 0: raise APIError('Saída maior que o estoque atual ou contagem inválida', 400)
            p['quantity'] = after; self._move(pid, k, after - before, before, after, pl.get('note', '')); return {'ok': True, 'before': before, 'after': after}
        if cmd == 'update':
            p.update(name=pl['name'].strip(), category=pl.get('category', ''), min_quantity=pl.get('min_quantity', 0), notes=pl.get('notes', '')); self._attach(pid, pl); return {'ok': True}
        if cmd == 'confirm': p['review_status'] = 'confirmado'; return {'ok': True}
        if cmd == 'delete':
            self.products.remove(p)
            for x in self.photos:
                if x['product_id'] == pid: x.update(product_id=None, review_status='pendente', is_primary=0)
            return {'ok': True}
        raise APIError('Ação inválida', 400)

    def _attach(self, pid, pl):
        if 'photo' in pl:
            for x in self.photos:
                if x['product_id'] == pid: x['is_primary'] = 0
            self.photos.append({'id': self.seq['ph'], 'product_id': pid, 'filename': pl['photo']['filename'], 'mime': pl['photo']['mime'], 'storage_path': pl['photo']['storage_path'],
                                'thumb_path': None, 'is_primary': 1, 'review_status': 'confirmada', 'review_note': '', 'created_at': '2026-10-23T12:00:00+00:00'}); self.seq['ph'] += 1

    def repair_command(self, cmd, pid, pl):
        if cmd == 'create':
            r = {'id': self.seq['r'], 'name': pl['name'], 'category': pl.get('category', ''), 'quantity': pl['quantity'], 'defect': pl['defect'], 'notes': pl.get('notes', ''),
                 'status': pl.get('status', 'aguardando'), 'photo_path': pl.get('photo_path'), 'created_at': '2026-10-23T12:00:00+00:00', 'updated_at': '2026-10-23T12:00:00+00:00', 'archived_at': None}
            self.seq['r'] += 1; self.repairs.append(r); return r
        r = next(x for x in self.repairs if x['id'] == pid)
        if cmd == 'archive': r['archived_at'] = 'x'
        else: r.update({k: pl[k] for k in ('name', 'category', 'quantity', 'defect', 'notes', 'status') if k in pl})
        return r
