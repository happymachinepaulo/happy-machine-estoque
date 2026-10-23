import json, threading, unittest, urllib.request, urllib.error
from http.server import ThreadingHTTPServer
from loadapi import load
from fakebackend import Fake, fake_jwt

import os
os.environ.update(SUPABASE_URL='http://127.0.0.1:1', SUPABASE_ANON_KEY='sb_publishable_test', APP_ORIGIN='http://app.test')
api = load()


def base():
    prods = [{'id': i, 'name': f'Peça {i}', 'category': 'Placas', 'quantity': i, 'min_quantity': 2, 'notes': '', 'source_text': '', 'review_status': 'confirmado', 'updated_at': '2026-10-01T00:00:00+00:00'} for i in (1, 2, 3)]
    phs = [{'id': 1, 'product_id': 1, 'filename': 'a.jpg', 'mime': 'image/jpeg', 'storage_path': 'uploads/a.jpg', 'thumb_path': 'thumbs/a.jpg', 'is_primary': 1, 'review_status': 'confirmada', 'review_note': '', 'created_at': ''}]
    phs += [{'id': 10 + k, 'product_id': None, 'filename': f'p{k}.jpg', 'mime': 'image/jpeg', 'storage_path': f'uploads/p{k}.jpg', 'thumb_path': None, 'is_primary': 0, 'review_status': 'pendente', 'review_note': '', 'created_at': ''} for k in range(5)]
    return prods, phs


class API(unittest.TestCase):
    def setUp(self):
        self.fake = Fake(*base()); api._sessions.clear(); api._signed.clear()
        self.old = api.remote; api.remote = self.fake.remote
        self.srv = ThreadingHTTPServer(('127.0.0.1', 0), api.handler); threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.port = self.srv.server_address[1]

    def tearDown(self):
        api.remote = self.old; self.srv.shutdown(); self.srv.server_close()

    def req(self, path, method='GET', body=None, token=True, headers=None):
        h = dict(headers or {})
        if token: h['Authorization'] = 'Bearer ' + fake_jwt()
        data = None
        if body is not None: data = json.dumps(body).encode(); h['Content-Type'] = 'application/json'
        r = urllib.request.Request(f'http://127.0.0.1:{self.port}{path}', data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(r) as x: raw = x.read(); return x.status, raw
        except urllib.error.HTTPError as e: return e.code, e.read()

    def j(self, *a, **k):
        s, raw = self.req(*a, **k); return s, json.loads(raw)

    def test_health_sem_login(self): self.assertEqual(self.j('/api/health', token=False), (200, {'ok': True}))
    def test_sem_token_401(self): self.assertEqual(self.req('/api/boot', token=False)[0], 401)

    def test_boot_traz_tudo_numa_chamada(self):
        s, d = self.j('/api/boot'); self.assertEqual(s, 200)
        self.assertEqual(len(d['products']), 3); self.assertEqual(d['pending_photos'], 5)
        p1 = next(p for p in d['products'] if p['id'] == 1); self.assertTrue(p1['photo']); self.assertEqual(p1['photo_count'], 1)
        self.assertFalse(next(p for p in d['products'] if p['id'] == 2)['photo'])

    def test_sessao_em_cache(self):
        self.req('/api/me'); n = sum(1 for c in self.fake.calls if c[1] == '/auth/v1/user'); self.req('/api/me'); self.req('/api/boot')
        self.assertEqual(sum(1 for c in self.fake.calls if c[1] == '/auth/v1/user'), n)

    def test_entrada_saida_e_saldo_negativo(self):
        self.assertEqual(self.j('/api/products/2/movement', 'POST', {'kind': 'entrada', 'amount': 3})[0], 200)
        self.assertEqual(self.fake.products[1]['quantity'], 5)
        self.assertEqual(self.j('/api/products/2/movement', 'POST', {'kind': 'saida', 'amount': 99})[0], 400)
        self.assertEqual(self.fake.products[1]['quantity'], 5)

    def test_revisao_paginada(self):
        s, d = self.j('/api/review?status=pendente&limit=2&offset=0'); self.assertEqual(s, 200)
        self.assertEqual(len(d['rows']), 2); self.assertEqual(d['total'], 5)
        s, d = self.j('/api/review?status=pendente&limit=2&offset=4'); self.assertEqual(len(d['rows']), 1)

    def test_excluir_devolve_foto_para_revisao(self):
        self.assertEqual(self.j('/api/products/1', 'DELETE')[0], 200)
        self.assertEqual(self.j('/api/boot')[1]['pending_photos'], 6)

    def test_login_exige_origem(self):
        self.assertEqual(self.j('/api/auth/login', 'POST', {'email': 'a@b.c', 'password': 'x'}, token=False)[0], 403)

    def test_operador_nao_acessa_admin(self):
        self.fake.profile['role'] = 'operator'; self.assertEqual(self.req('/api/admin/users')[0], 403)

    def test_historico_e_csv(self):
        self.j('/api/products/3/movement', 'POST', {'kind': 'saida', 'amount': 1})
        self.assertEqual(self.j('/api/history?limit=10')[0], 200)
        s, raw = self.req('/api/export.csv'); self.assertEqual(s, 200); self.assertIn(b'Pe\xc3\xa7a 1', raw)

    def test_consertos_duas_chamadas_seguidas(self):
        self.assertEqual(self.j('/api/repairs')[0], 200); self.assertEqual(self.j('/api/repairs')[0], 200)


if __name__ == '__main__': unittest.main()
