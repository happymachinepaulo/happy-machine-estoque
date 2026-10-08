"""Loopback-only preview. No fallback to the unprotected local database."""
from pathlib import Path
import sys, urllib.parse, mimetypes
from http.server import ThreadingHTTPServer
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'scripts'))
from api.index import handler
from common import load_env
load_env()
class Preview(handler):
    def do_GET(self):
        p=urllib.parse.urlsplit(self.path).path
        if p.startswith('/api/'):return super().do_GET()
        target=(ROOT/'public'/p.lstrip('/')).resolve() if p!='/' else ROOT/'public/index.html'
        if (ROOT/'public').resolve() not in target.parents or not target.is_file():return self.respond({'error':'Não encontrado'},404)
        return self.respond(target.read_bytes(),ctype=mimetypes.guess_type(target.name)[0] or 'application/octet-stream')
if __name__=='__main__':
    print('Preview online: http://127.0.0.1:8770',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8770),Preview).serve_forever()
