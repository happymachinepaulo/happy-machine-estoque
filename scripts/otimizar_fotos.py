"""Cria miniaturas (480 px) das fotos já enviadas e grava em photos.thumb_path. Deixa o site bem mais rápido.
Rode depois de aplicar supabase/017_desempenho.sql.  Uso: python scripts/otimizar_fotos.py [--teste]"""
import io, os, sys, urllib.parse, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import load_env, remote, all_rows
from PIL import Image, ImageOps


def main():
    load_env(); teste = '--teste' in sys.argv
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']; base = os.environ['SUPABASE_URL'].rstrip('/')
    pend = [p for p in all_rows('photos') if not p.get('thumb_path')]
    print(len(pend), 'fotos sem miniatura')
    for p in pend:
        try:
            req = urllib.request.Request(base + '/storage/v1/object/authenticated/stock-photos/' + urllib.parse.quote(p['storage_path']), headers={'apikey': key, 'Authorization': 'Bearer ' + key})
            im = ImageOps.exif_transpose(Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read()))).convert('RGB'); im.thumbnail((480, 480))
            b = io.BytesIO(); im.save(b, 'JPEG', quality=78, optimize=True, progressive=True)
            t = 'thumbs/' + Path(p['storage_path']).stem + '.jpg'
            if not teste:
                remote('/storage/v1/object/stock-photos/' + t, 'POST', b.getvalue(), headers={'Content-Type': 'image/jpeg', 'x-upsert': 'true'})
                remote(f'/rest/v1/photos?id=eq.{p["id"]}', 'PATCH', {'thumb_path': t}, headers={'Prefer': 'return=minimal'})
            print('ok', p['id'])
        except Exception as e: print('falhou', p['id'], type(e).__name__)


main()
