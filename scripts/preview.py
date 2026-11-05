"""Pré-visualização local com dados de demonstração (sem Supabase, sem internet).
Uso: python scripts/preview.py [--fotos PASTA_COM_JPGS] [--porta 8770]
Entre com qualquer e-mail e senha; o código é 000000."""
import argparse, os, sys, mimetypes, random, tempfile, threading
from pathlib import Path
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests'))
ap = argparse.ArgumentParser(); ap.add_argument('--fotos'); ap.add_argument('--porta', type=int, default=8770); ap.add_argument('--papel', default='admin')
args = ap.parse_args()
os.environ.update(SUPABASE_URL=f'http://127.0.0.1:{args.porta}', SUPABASE_ANON_KEY='sb_publishable_demo', APP_ORIGIN=f'http://127.0.0.1:{args.porta}')
from loadapi import load
from fakebackend import Fake
api = load()

NAMES = [('Motor da garra Mega', 'Motores', 12, 4), ('Sensor grande de Mega', 'Sensores', 120, 20), ('Bobina térmica 80 mm', 'Impressoras', 236, 50), ('Refletor 12V', 'Iluminação', 25, 5),
         ('Fonte Ubiquiti', 'Fontes', 17, 6), ('Cabo de alimentação', 'Cabos', 67, 10), ('Roteador TP-Link', 'Rede', 7, 3), ('Botão de painel vermelho', 'Comandos', 8, 8),
         ('Placa de LED branco', 'Iluminação', 3, 4), ('Chave de fenda articulada', 'Ferramentas', 0, 2), ('Teclado USB', 'Informática', 16, 0), ('Mouse óptico', 'Informática', 10, 0),
         ('Cabo VGA', 'Cabos', 36, 0), ('Conversor HDMI', 'Informática', 33, 5), ('Leitor de código de barras', 'Informática', 9, 2), ('Câmera interna', 'Segurança', 10, 2),
         ('Estabilizador', 'Energia', 21, 5), ('Régua de energia', 'Energia', 13, 3), ('Switch 8 portas', 'Rede', 8, 2), ('DVR 8 canais', 'Segurança', 6, 2)]
tmp = Path(tempfile.mkdtemp()); files = {}
src = sorted(Path(args.fotos).glob('*.jpg'))[:60] if args.fotos else []
from PIL import Image, ImageDraw
def make(i):
    name = f'demo{i}.jpg'
    if src:
        im = Image.open(src[i % len(src)]).convert('RGB'); im.thumbnail((480, 480))
    else:
        r = random.Random(i); im = Image.new('RGB', (480, 360), tuple(r.randint(150, 235) for _ in range(3))); ImageDraw.Draw(im).text((20, 20), f'Foto {i}', fill=(40, 40, 40))
    im.save(tmp / name, quality=80); return name
products, photos = [], []
for i, (nome, cat, q, mn) in enumerate(NAMES, 1):
    products.append({'id': i, 'name': nome, 'category': cat, 'quantity': q, 'min_quantity': mn, 'notes': '', 'source_text': '', 'review_status': 'pendente' if i in (4, 9) else 'confirmado', 'updated_at': f'2026-10-{10 + i:02d}T12:00:00+00:00', 'location': 'JJGFBKGJFCCCKCCDGBGG'[i - 1] if i not in (10, 18) else ''})
    if i not in (12, 13):
        n = make(i); files[f'uploads/{n}'] = files[f'thumbs/{n}'] = n
        photos.append({'id': i, 'product_id': i, 'filename': n, 'mime': 'image/jpeg', 'storage_path': f'uploads/{n}', 'thumb_path': f'thumbs/{n}', 'is_primary': 1, 'review_status': 'confirmada', 'review_note': '', 'created_at': ''})
for k in range(30, 40):
    n = make(k); files[f'uploads/{n}'] = files[f'thumbs/{n}'] = n
    photos.append({'id': k, 'product_id': None, 'filename': n, 'mime': 'image/jpeg', 'storage_path': f'uploads/{n}', 'thumb_path': f'thumbs/{n}', 'is_primary': 0, 'review_status': 'pendente',
                   'review_note': f'Nome sugerido: {NAMES[k % 10][0]}\nCadastros existentes da revisão: #{k % 10 + 1}' if k % 3 == 0 else 'Origem: WhatsApp 2026-10-02', 'created_at': ''})
fake = Fake(products, photos, role=args.papel)
fake.repairs = [{'id': 1, 'name': 'Placa controladora', 'category': 'Placas', 'quantity': 3, 'defect': 'Não liga; capacitor estufado', 'notes': '', 'status': 'em_conserto', 'photo_path': None, 'created_at': '2026-10-09T10:00:00+00:00', 'updated_at': '2026-10-12T10:00:00+00:00', 'archived_at': None}]
fake.holders.append({'id': 3, 'name': 'Carlos Lima', 'active': True, 'created_at': ''})
fake.holder_stock = [{'holder_id': h, 'product_id': pid, 'quantity': q, 'updated_at': ''} for h, pid, q in [(1, 2, 8), (1, 6, 4), (1, 15, 1), (2, 2, 5), (2, 3, 20), (2, 7, 1), (2, 11, 2), (2, 17, 1), (3, 5, 2)]]
for p in products[:6]:
    fake._move(p['id'], 'cadastro', p['quantity'], 0, p['quantity'], 'Cadastro do item')
# movimentações de exemplo espalhadas pela última semana (para o gráfico do Painel)
import datetime as _dt
_now = _dt.datetime.now(_dt.timezone.utc); _r = random.Random(7)
for d in range(6, -1, -1):
    for k in range(_r.randint(2, 9) if d else 5):
        pid = _r.randint(1, len(products)); kind = _r.choice(['saida', 'saida', 'entrada', 'consumo'])
        hid = _r.choice([1, 2, 3, None]); dest = '' if hid and kind != 'consumo' else _r.choice(['Uso em máquina', 'Cliente', 'Outros: Feira de SP'])
        fake._move(pid, kind, -1 if kind != 'entrada' else 1, 10, 9, '', hid, dest)
        fake.movements[-1]['created_at'] = (_now - _dt.timedelta(days=d, hours=_r.randint(0, 6), minutes=_r.randint(0, 59))).isoformat()
api.remote = fake.remote

class Handler(api.handler):
    def _static(self):
        path = self.path.split('?')[0]
        if path.startswith('/storage/v1/object/sign/stock-photos/'):
            f = files.get(path.split('/stock-photos/', 1)[1]); data = (tmp / f).read_bytes() if f else None; ctype = 'image/jpeg'
        else:
            rel = path.lstrip('/') or 'index.html'; fp = (ROOT / 'public' / rel).resolve()
            if not fp.is_file() or ROOT / 'public' not in fp.parents: fp = ROOT / 'public' / 'index.html'
            data = fp.read_bytes(); ctype = mimetypes.guess_type(str(fp))[0] or 'application/octet-stream'
        if data is None: self.send_response(404); self.end_headers(); return
        self.send_response(200); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        self._static() if not self.path.startswith('/api/') else self.dispatch('GET')

if __name__ == '__main__':
    s = ThreadingHTTPServer(('127.0.0.1', args.porta), Handler)
    print(f'Pré-visualização em http://127.0.0.1:{args.porta}  (código de acesso: 000000)'); s.serve_forever()
