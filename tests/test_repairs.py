import unittest,io,json,threading,urllib.request,urllib.error
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from test_security import api,jwt,UID

class RepairAPI(unittest.TestCase):
 def setUp(self):
  self.calls=[]
  def remote(path,method='GET',data=None,**kwargs):
   self.calls.append((path,method,data,kwargs))
   if path=='/auth/v1/user':return {'id':UID}
   if path=='/rest/v1/rpc/stock_access':return api.claims(kwargs['token'])['session_id']=='email-verified-session'
   if path.startswith('/rest/v1/profiles'):return [{'id':UID,'active':True,'role':'operator'}]
   if path.startswith('/rest/v1/repairs'):return [{'id':1,'name':'Motor quebrado','quantity':2,'photo_path':'repairs/test.png','photo_mime':'image/png'}]
   if path=='/rest/v1/rpc/repair_command':return {'id':1,**data['payload']}
   if path.startswith('/storage/'):return b'photo' if kwargs.get('raw') else {}
   raise AssertionError(path)
  self.mock=patch.object(api,'remote',side_effect=remote);self.mock.start();self.addCleanup(self.mock.stop)
  self.server=ThreadingHTTPServer(('127.0.0.1',0),api.handler);self.server_thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.server_thread.start();self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
 def request(self,path,method='GET',body=None,ctype=None,token=None):
  headers={'Authorization':'Bearer '+(token or jwt())}
  if ctype:headers['Content-Type']=ctype
  req=urllib.request.Request('http://127.0.0.1:'+str(self.server.server_port)+path,data=body,headers=headers,method=method)
  try:r=urllib.request.urlopen(req)
  except urllib.error.HTTPError as e:r=e
  return r.status,r.read()
 def multipart(self,fields):
  return ''.join(f'--qa\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n' for k,v in fields.items()).encode()+b'--qa--\r\n'
 def test_password_only_denied(self):
  status,_=self.request('/api/repairs',token=jwt('aal1'));self.assertEqual(status,403)
  self.assertFalse(any('/repairs?' in c[0] for c in self.calls))
 def test_create_never_calls_stock_command(self):
  fields={'name':'Motor','quantity':'2','defect':'Não gira','status':'aguardando','photo_path':'uploads/forged.jpg'}
  status,raw=self.request('/api/repairs','POST',self.multipart(fields),'multipart/form-data; boundary=qa')
  self.assertEqual(status,201);self.assertEqual(json.loads(raw)['quantity'],2)
  rpc=next(c for c in self.calls if c[0].endswith('repair_command'))
  self.assertEqual(rpc[2]['command'],'create');self.assertNotIn('photo_path',rpc[2]['payload'])
  self.assertFalse(any('stock_command' in c[0] or '/products' in c[0] for c in self.calls))
 def test_zero_and_missing_defect_rejected(self):
  for fields in [{'name':'Motor','quantity':'0','defect':'Quebrou'},{'name':'Motor','quantity':'1','defect':''}]:
   status,_=self.request('/api/repairs','POST',self.multipart(fields),'multipart/form-data; boundary=qa');self.assertEqual(status,400)
  self.assertFalse(any('repair_command' in c[0] for c in self.calls))
 def test_status_update_preserves_concurrency_token(self):
  fields={'name':'Motor','quantity':'2','defect':'Quebrou','status':'consertada','updated_at':'2026-10-09T12:00:00Z'}
  status,_=self.request('/api/repairs/1/update','POST',self.multipart(fields),'multipart/form-data; boundary=qa');self.assertEqual(status,200)
  rpc=next(c for c in self.calls if c[0].endswith('repair_command'));self.assertEqual(rpc[2]['payload']['updated_at'],fields['updated_at'])
 def test_photo_needs_verified_session_and_database_reference(self):
  status,body=self.request('/api/repairs/1/photo');self.assertEqual((status,body),(200,b'photo'))
  storage=next(c for c in self.calls if c[0].startswith('/storage/'));self.assertEqual(storage[3]['token'],jwt());self.assertFalse(storage[3].get('service',False))
 def test_archive_soft_command(self):
  status,_=self.request('/api/repairs/1/archive','POST',json.dumps({'updated_at':'2026-10-09T12:00:00Z'}).encode(),'application/json');self.assertEqual(status,200)
  rpc=next(c for c in self.calls if c[0].endswith('repair_command'));self.assertEqual(rpc[2]['command'],'archive')

if __name__=='__main__':unittest.main()
