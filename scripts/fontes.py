"""Cadastra a Fonte TX GB e a Fonte TX Mega (se ainda não existirem) e coloca as fotos de 11/11/2026.
Fotos em scripts/fotos_fontes. Peça nova entra com 0 un. e 'pendente': conte e ajuste a quantidade no site.
Quem já tem foto principal mantém; a nova entra como extra. Rodar de novo não duplica. Não mexe em quantidade existente.

Uso:  python scripts/fontes.py            # simulação
      python scripts/fontes.py --enviar   # grava
Requer: pip install pillow  e  .env.local com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."""
import argparse, io, secrets, sys, urllib.parse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import remote
from PIL import Image, ImageOps

PASTA = Path(__file__).parent / 'fotos_fontes'
BUCKET = '/storage/v1/object/stock-photos/'
FONTES = [  # (arquivo, nome a criar, padrão no nome que identifica a peça existente)
    ('fonte-tx-gb.jpg', 'Fonte TX GB', ('tx gb', 'txgb', 'tx-gb')),
    ('fonte-tx-mega.jpg', 'Fonte TX Mega', ('tx mega', 'txmega', 'tx-mega')),
]


def q(table, **params): return remote(f'/rest/v1/{table}?' + urllib.parse.urlencode(params)) or []


def jpeg(data, lado, qual):
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB'); im.thumbnail((lado, lado))
    b = io.BytesIO(); im.save(b, 'JPEG', quality=qual, optimize=True, progressive=True); return b.getvalue()


def fotos_visiveis(pid): return q('photos', select='id,filename,is_primary', product_id=f'eq.{pid}', review_status='neq.oculta')


def main():
    a = argparse.ArgumentParser(); a.add_argument('--enviar', action='store_true'); enviar = a.parse_args().enviar
    prods = q('products', select='id,name,quantity', order='id.asc', **{'or': '(name.ilike.*fonte*,name.ilike.*TX*)'})
    print('Fontes no estoque hoje:')
    for p in prods: print(f"  #{p['id']} {p['name']} — {p['quantity']} un.")
    for arquivo, nome, chaves in FONTES:
        alvo = next((p for p in prods if any(c in p['name'].lower() for c in chaves)), None)
        if not alvo:
            print(f'→ Vou cadastrar: {nome} (0 un., pendente)')
            if enviar:
                alvo = remote('/rest/v1/products', 'POST', {'name': nome, 'category': 'Fontes', 'quantity': 0, 'min_quantity': 0, 'review_status': 'pendente',
                              'notes': '[11/11/2026] Cadastrada pela foto. Quantidade a contar.', 'source_text': 'Foto enviada em 11/11/2026'},
                              headers={'Prefer': 'return=representation'})[0]
                print(f"  criada #{alvo['id']}")
            else: alvo = {'id': None, 'name': nome}
        ja = fotos_visiveis(alvo['id']) if alvo['id'] else []
        if any(f['filename'] == arquivo for f in ja): print(f"  {arquivo}: já está em #{alvo['id']}."); continue
        principal = 0 if any(f['is_primary'] for f in ja) else 1
        print(f"→ {arquivo} → #{alvo['id'] or 'nova'} {alvo['name']} ({'principal' if principal else 'foto extra'})")
        if not enviar: continue
        data = (PASTA / arquivo).read_bytes(); n = secrets.token_hex(24)
        path, thumb = f"produtos/{alvo['id']}/{n}.jpg", f'thumbs/{n}.jpg'
        remote(BUCKET + path, 'POST', jpeg(data, 1600, 84), headers={'Content-Type': 'image/jpeg', 'x-upsert': 'false'})
        remote(BUCKET + thumb, 'POST', jpeg(data, 480, 78), headers={'Content-Type': 'image/jpeg'})
        remote('/rest/v1/photos', 'POST', {'product_id': alvo['id'], 'filename': arquivo, 'mime': 'image/jpeg', 'storage_path': path, 'thumb_path': thumb,
               'is_primary': principal, 'review_status': 'confirmada', 'review_note': 'Foto enviada em 11/11/2026.'}, headers={'Prefer': 'return=minimal'})
    print('Pronto.' if enviar else 'Simulação. Rode com --enviar para gravar.')


main()
