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
        self.fake = Fake(*base()); api._sessions.clear(); api._signed.clear(); api._opened.clear()
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
        self.assertEqual(self.j('/api/products/2/movement', 'POST', {'kind': 'entrada', 'amount': 3, 'destination': 'Compra'})[0], 200)
        self.assertEqual(self.fake.products[1]['quantity'], 5)
        self.assertEqual(self.j('/api/products/2/movement', 'POST', {'kind': 'saida', 'amount': 99, 'destination': 'Loja'})[0], 400)
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
        self.j('/api/products/3/movement', 'POST', {'kind': 'saida', 'amount': 1, 'destination': 'Outros: evento'})
        self.assertEqual(self.j('/api/history?limit=10')[0], 200)
        s, raw = self.req('/api/export.csv'); self.assertEqual(s, 200); self.assertIn(b'Pe\xc3\xa7a 1', raw)

    def test_consertos_duas_chamadas_seguidas(self):
        self.assertEqual(self.j('/api/repairs')[0], 200); self.assertEqual(self.j('/api/repairs')[0], 200)

    def test_saida_exige_destino(self):
        self.assertEqual(self.j('/api/products/3/movement', 'POST', {'kind': 'saida', 'amount': 1})[0], 400)
        self.assertEqual(self.fake.products[2]['quantity'], 3)

    def test_saida_para_pessoa_e_devolucao(self):
        s, d = self.j('/api/products/3/movement', 'POST', {'kind': 'saida', 'amount': 2, 'holder_id': 1}); self.assertEqual(s, 200)
        self.assertEqual(self.fake.products[2]['quantity'], 1)
        bruno = next(h for h in self.j('/api/boot')[1]['holders'] if h['id'] == 1)
        self.assertEqual(bruno['items'], [{'product_id': 3, 'quantity': 2, 'updated_at': ''}])
        self.assertEqual(self.j('/api/products/3/movement', 'POST', {'kind': 'entrada', 'amount': 3, 'holder_id': 1})[0], 400)
        self.assertEqual(self.j('/api/products/3/movement', 'POST', {'kind': 'entrada', 'amount': 1, 'holder_id': 1})[0], 200)
        self.assertEqual(self.fake.products[2]['quantity'], 2)
        self.assertEqual(self.j('/api/holders/1/consume', 'POST', {'product_id': 3, 'amount': 1, 'destination': 'Máquina 4'})[0], 200)
        self.assertEqual(self.j('/api/boot')[1]['holders'][0]['items'], [])
        self.assertEqual(self.fake.products[2]['quantity'], 2)
        s, hist = self.j('/api/history?holder=1'); self.assertEqual([m['kind'] for m in hist], ['consumo', 'entrada', 'saida'])

    def test_pessoas_criar_e_arquivar(self):
        self.assertEqual(self.j('/api/holders', 'POST', {'name': 'Ana'})[0], 201)
        self.assertEqual(self.j('/api/holders', 'POST', {'name': ' '})[0], 400)
        self.j('/api/products/1/movement', 'POST', {'kind': 'saida', 'amount': 1, 'holder_id': 3})
        self.assertEqual(self.j('/api/holders/3/update', 'POST', {'active': False})[0], 400)

    def test_conta_nome_e_senha(self):
        self.assertEqual(self.j('/api/account/profile', 'POST', {'name': 'Paulo Silva'})[0], 200)
        self.assertEqual(self.fake.profile['name'], 'Paulo Silva')
        s, r = self.j('/api/account/password', 'POST', {'password': 'senha-errada', 'new_password': 'NovaSenhaForte2026'})
        self.assertEqual((s, r['error']), (400, 'Senha atual incorreta.'))
        self.assertEqual(self.j('/api/account/password', 'POST', {'password': 'x', 'new_password': 'curta1'})[0], 400)
        self.assertEqual(self.j('/api/account/password', 'POST', {'password': 'atual', 'new_password': 'SoDezLetra1'})[0], 400)   # mínimo 16
        self.assertEqual(self.j('/api/account/password', 'POST', {'password': 'atual', 'new_password': 'NovaSenhaForte2026'})[0], 200)
        self.assertEqual(self.fake.account_ops[-1], ('PUT', {'password': 'NovaSenhaForte2026'}))

    def test_excluir_conta(self):
        s, r = self.j('/api/account/delete', 'POST', {'password': 'atual', 'confirm': 'EXCLUIR'})
        self.assertEqual(s, 400)   # administrador principal não pode
        self.fake.profile['role'] = 'operator'; api._sessions.clear()
        self.assertEqual(self.j('/api/account/delete', 'POST', {'password': 'atual', 'confirm': 'nao'})[0], 400)
        self.assertEqual(self.j('/api/account/delete', 'POST', {'password': 'atual', 'confirm': 'excluir'})[0], 200)
        self.assertEqual(self.fake.account_ops[-1][0], 'DELETE')

    def test_sair_dos_outros_aparelhos(self):
        self.assertEqual(self.j('/api/account/logout-others', 'POST', {})[0], 200)


    def test_estante_da_peca(self):
        s, d = self.j('/api/products/2/location', 'POST', {'location': 'f'})
        self.assertEqual((s, d['location']), (200, 'F'))
        self.assertEqual(next(p for p in self.j('/api/boot')[1]['products'] if p['id'] == 2)['location'], 'F')
        self.assertEqual(self.j('/api/products/2/location', 'POST', {'location': 'Z'})[0], 400)
        self.assertEqual(self.j('/api/products/99/location', 'POST', {'location': 'A'})[0], 404)
        self.fake.profile['role'] = 'operator'; api._sessions.clear()
        self.assertEqual(self.j('/api/products/2/location', 'POST', {'location': 'A'})[0], 403)   # estante: só o administrador

    def test_fotos_do_galpao_exigem_login(self):
        self.assertEqual(self.req('/api/galpao/A1.jpg', token=False)[0], 401)
        s, raw = self.req('/api/galpao/tA1.jpg')
        self.assertEqual((s, raw[:2]), (200, b'\xff\xd8'))
        self.assertEqual(self.req('/api/galpao/..%2Fapi.jpg')[0], 404)
        self.assertEqual(self.req('/api/galpao/Z9.jpg')[0], 404)
        self.fake.profile['role'] = 'operator'; api._sessions.clear()
        self.assertEqual(self.req('/api/galpao/tA1.jpg')[0], 403)      # provisório: só o administrador

    def test_logs_de_acesso(self):
        o = {'Origin': 'http://app.test', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'X-Forwarded-For': '200.1.2.3, 10.0.0.1'}
        self.assertEqual(self.j('/api/auth/login', 'POST', {'email': 'demo@happymachine.test', 'password': 'senha-errada'}, token=False, headers=o)[0], 401)
        s, d = self.j('/api/auth/login', 'POST', {'email': 'demo@happymachine.test', 'password': 'ok'}, token=False, headers=o); self.assertEqual(s, 200)
        self.assertEqual(self.j('/api/auth/verify', 'POST', {'challenge': d['challenge'], 'code': '111111'}, token=False, headers=o)[0], 400)
        self.assertEqual(self.j('/api/auth/verify', 'POST', {'challenge': d['challenge'], 'code': '000000'}, token=False, headers=o)[0], 200)
        self.req('/api/boot', headers=o); self.req('/api/boot', headers=o)      # recarregar não duplica "abriu"
        ev = [(a['event'], a['ok']) for a in self.fake.access]
        self.assertEqual(ev, [('senha_errada', False), ('senha_ok', True), ('codigo_errado', False), ('entrou', True), ('abriu', True)])
        self.assertEqual((self.fake.access[3]['device'], self.fake.access[3]['ip']), ('iPhone · Safari', '200.1.2.3'))
        s, d = self.j('/api/admin/logs'); self.assertEqual((s, d['ready'], len(d['access'])), (200, True, 5))
        self.fake.profile['role'] = 'operator'; api._sessions.clear()
        self.assertEqual(self.req('/api/admin/logs')[0], 403)

    def test_marcacoes_do_galpao(self):
        self.assertEqual(self.j('/api/galpao/layout'), (200, {'layout': None}))
        s, d = self.j('/api/galpao/layout', 'POST', {'shelves': {'A': [[1, 2, 10, 20]], 'K': []}})
        self.assertEqual((s, d['layout']['shelves']), (200, {'A': [[1.0, 2.0, 10.0, 20.0]]}))
        self.assertEqual(self.j('/api/galpao/layout')[1]['layout']['shelves']['A'], [[1.0, 2.0, 10.0, 20.0]])
        self.assertEqual(self.j('/api/galpao/layout', 'POST', {'shelves': {'Z': [[1, 2, 3, 4]]}})[0], 400)
        self.assertEqual(self.j('/api/galpao/layout', 'POST', {'shelves': {'A': [[95, 2, 10, 4]]}})[0], 400)
        self.assertEqual(self.req('/api/galpao/pano.jpg')[0], 200)
        self.fake.profile['role'] = 'operator'; api._sessions.clear()
        self.assertEqual(self.j('/api/galpao/layout', 'POST', {'shelves': {}})[0], 403)

    def test_nome_do_aparelho(self):
        d = api.device_name
        self.assertEqual(d('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'), 'Windows · Chrome')
        self.assertEqual(d('Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'), 'Android (SM-A546E) · Chrome')
        self.assertEqual(d('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15'), 'Mac · Safari')
        self.assertEqual(d('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0'), 'Windows · Edge')
        self.assertEqual(d(''), 'Desconhecido')


if __name__ == '__main__': unittest.main()
