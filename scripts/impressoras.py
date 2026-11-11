"""Cadastra a impressora Argox (se ainda não existir) e coloca as fotos de 11/11/2026 nas impressoras.
Fotos em scripts/fotos_impressoras: Bematech MP-4200 TH ADV, Xprinter 80 mm e Argox (etiquetas).

- Argox: se não houver nenhuma peça com "argox" no nome, cria "Impressora de etiquetas Argox" (1 un., categoria Impressoras).
- Cada foto vai para a peça daquele modelo (nome com bematech / xprinter / argox). Se não houver peça própria,
  Bematech e Xprinter vão para a "Impressora térmica de recibos" (#168), onde as duas já estão somadas.
- A foto só vira a principal se a peça ainda não tiver foto; senão entra como foto extra. Rodar de novo não duplica.
- Não mexe em quantidade de peça que já existe.

Uso:  python scripts/impressoras.py            # simulação (mostra o que faria, não grava)
      python scripts/impressoras.py --enviar   # grava de verdade
Requer: pip install pillow  e  .env.local com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."""
import argparse, io, secrets, sys, urllib.parse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import remote
from PIL import Image, ImageOps

PASTA = Path(__file__).parent / 'fotos_impressoras'
BUCKET = '/storage/v1/object/stock-photos/'
TERMICA = 168  # "Impressora térmica de recibos": saldo único das térmicas (Xprinter + Bematech)
FOTOS = [  # (arquivo, palavra no nome da peça, peça reserva se não houver uma própria)
    ('bematech-mp4200-th-adv.jpg', 'bematech', TERMICA),
    ('xprinter-80mm.jpg', 'xprinter', TERMICA),
    ('argox-etiquetas.jpg', 'argox', None),
]
ARGOX = {'name': 'Impressora de etiquetas Argox', 'category': 'Impressoras', 'quantity': 1, 'min_quantity': 0,
         'notes': '[11/11/2026] Cadastrada pela foto: impressora de etiquetas Argox (transferência térmica), em uso na mesa. Modelo exato não legível na foto.',
         'source_text': 'Foto enviada em 11/11/2026', 'review_status': 'confirmado'}


def q(table, **params): return remote(f'/rest/v1/{table}?' + urllib.parse.urlencode(params)) or []


def jpeg(data, lado, qual):
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB'); im.thumbnail((lado, lado))
    b = io.BytesIO(); im.save(b, 'JPEG', quality=qual, optimize=True, progressive=True); return b.getvalue()


def fotos_visiveis(pid): return q('photos', select='id,filename,is_primary', product_id=f'eq.{pid}', review_status='neq.oculta')


def main():
    a = argparse.ArgumentParser(); a.add_argument('--enviar', action='store_true'); enviar = a.parse_args().enviar
    impressoras = q('products', select='id,name,quantity', order='id.asc',
                    **{'or': '(category.ilike.*impressora*,name.ilike.*impressora*,name.ilike.*argox*,name.ilike.*bematech*,name.ilike.*xprinter*)'})
    print('Impressoras no estoque hoje:')
    for p in impressoras: print(f"  #{p['id']} {p['name']} — {p['quantity']} un., {len(fotos_visiveis(p['id']))} foto(s)")

    if not any('argox' in p['name'].lower() for p in impressoras):
        print(f"→ Vou cadastrar: {ARGOX['name']} ({ARGOX['quantity']} un.)")
        if enviar:
            novo = remote('/rest/v1/products', 'POST', ARGOX, headers={'Prefer': 'return=representation'})[0]
            remote('/rest/v1/movements', 'POST', {'product_id': novo['id'], 'kind': 'cadastro', 'amount': ARGOX['quantity'], 'before_qty': 0,
                                                  'after_qty': ARGOX['quantity'], 'note': 'Cadastro pela foto de 11/11/2026'}, headers={'Prefer': 'return=minimal'})
            impressoras.append(novo); print(f"  criada #{novo['id']}")
        else: impressoras.append({'id': None, 'name': ARGOX['name']})
    else: print('→ Argox já cadastrada, não crio outra.')

    for arquivo, chave, reserva in FOTOS:
        alvo = next((p for p in impressoras if chave in p['name'].lower()), None) or next((p for p in impressoras if p['id'] == reserva), None)
        if not alvo: print(f'  {arquivo}: não achei a peça, pulei.'); continue
        ja = fotos_visiveis(alvo['id']) if alvo['id'] else []
        if any(f['filename'] == arquivo for f in ja): print(f"  {arquivo}: já está em #{alvo['id']}."); continue
        principal = 0 if any(f['is_primary'] for f in ja) else 1
        print(f"→ {arquivo} → #{alvo['id'] or 'nova'} {alvo['name']} ({'principal' if principal else 'foto extra'})")
        if not enviar: continue
        data = (PASTA / arquivo).read_bytes(); nome = secrets.token_hex(24)
        path, thumb = f"produtos/{alvo['id']}/{nome}.jpg", f'thumbs/{nome}.jpg'
        remote(BUCKET + path, 'POST', jpeg(data, 1600, 84), headers={'Content-Type': 'image/jpeg', 'x-upsert': 'false'})
        remote(BUCKET + thumb, 'POST', jpeg(data, 480, 78), headers={'Content-Type': 'image/jpeg'})
        remote('/rest/v1/photos', 'POST', {'product_id': alvo['id'], 'filename': arquivo, 'mime': 'image/jpeg', 'storage_path': path, 'thumb_path': thumb,
                                           'is_primary': principal, 'review_status': 'confirmada', 'review_note': 'Foto enviada em 11/11/2026.'},
               headers={'Prefer': 'return=minimal'})
    print('Pronto.' if enviar else 'Simulação. Rode com --enviar para gravar.')


main()
