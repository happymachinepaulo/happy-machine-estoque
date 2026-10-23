"""Envia para o estoque só as fotos NOVAS de migration/fotos_novas (sem repetir as que o site já tem).
Cada foto entra como 'pendente' na aba Fotos; a contagem fica com o site (você confirma lá). Não cria produto e não mexe em quantidade.
Uso:  python scripts/importar_fotos.py            # simulação (não grava nada)
      python scripts/importar_fotos.py --enviar   # grava de verdade
Requer: pip install pillow  e  .env.local com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."""
import argparse, hashlib, io, json, secrets, sys, urllib.parse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, remote, all_rows
from PIL import Image, ImageOps

PASTA = ROOT / 'migration' / 'fotos_novas'
BUCKET = '/storage/v1/object/stock-photos/'


def dhash(data, n=12):
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('L').resize((n + 1, n))
    px = list(im.getdata())
    return sum(1 << i for i, (a, b) in enumerate((px[r * (n + 1) + c], px[r * (n + 1) + c + 1]) for r in range(n) for c in range(n)) if a > b)


def baixar(path):
    h = {}
    import os, urllib.request
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    req = urllib.request.Request(os.environ['SUPABASE_URL'].rstrip('/') + '/storage/v1/object/authenticated/stock-photos/' + urllib.parse.quote(path),
                                 headers={'apikey': key, 'Authorization': 'Bearer ' + key})
    with urllib.request.urlopen(req, timeout=60) as r: return r.read()


def jpeg(data, lado, q):
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB'); im.thumbnail((lado, lado))
    b = io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True, progressive=True); return b.getvalue()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--enviar', action='store_true'); ap.add_argument('--limite-hash', type=int, default=6, help='distância máxima para considerar a foto repetida')
    a = ap.parse_args()
    man = json.loads((PASTA / 'manifest.json').read_text(encoding='utf-8'))
    existentes = all_rows('photos')
    print(f'{len(man)} fotos novas candidatas, {len(existentes)} já no site. Calculando semelhança...')
    hashes = []
    for p in existentes:
        try: hashes.append((p['id'], dhash(baixar(p['storage_path']))))
        except Exception: pass
    novas, repetidas = [], []
    for m in man:
        data = (PASTA / m['arquivo']).read_bytes(); h = dhash(data)
        igual = next((i for i, x in hashes if bin(h ^ x).count('1') <= a.limite_hash), None)
        (repetidas if igual else novas).append((m, data, igual))
    for m, _, i in repetidas: print(f'  repetida (foto #{i}): {m["arquivo"]}')
    print(f'→ {len(novas)} novas, {len(repetidas)} já existem no site.')
    if not a.enviar: print('Simulação. Rode com --enviar para gravar.'); return
    for m, data, _ in novas:
        nome = secrets.token_hex(24); path = f'pendentes/{nome}.jpg'; thumb = f'thumbs/{nome}.jpg'
        remote(BUCKET + path, 'POST', jpeg(data, 1600, 84), headers={'Content-Type': 'image/jpeg', 'x-upsert': 'false'})
        remote(BUCKET + thumb, 'POST', jpeg(data, 480, 78), headers={'Content-Type': 'image/jpeg'})
        nota = 'Foto do WhatsApp' + (f' — legenda: {m["legenda"]}' if m['legenda'] else '') + ' — conferir a quantidade no site.'
        row = {'filename': m['arquivo'], 'mime': 'image/jpeg', 'storage_path': path, 'review_status': 'pendente', 'is_primary': 0, 'review_note': nota}
        try: remote('/rest/v1/photos', 'POST', dict(row, thumb_path=thumb), headers={'Prefer': 'return=minimal'})
        except SystemExit: remote('/rest/v1/photos', 'POST', row, headers={'Prefer': 'return=minimal'})
        print('  enviada', m['arquivo'])
    print('Pronto. Abra a aba Fotos no site para vincular cada uma a uma peça.')


main()
