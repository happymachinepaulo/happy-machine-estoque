import unittest, importlib.util, base64, json, io, threading, urllib.request, urllib.error, os
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer

spec=importlib.util.spec_from_file_location('online_api',Path(__file__).resolve().parents[1]/'api/index.py')
api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
UID='11111111-1111-4111-8111-111111111111'
def jwt(aal='aal2',sub=UID):
    value={'sub':sub,'aal':aal,'exp':4102444800}
    return 'header.'+base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')+'.signature'

class Security(unittest.TestCase):
    def setUp(self):
        self.profile={'id':UID,'email':'operator@example.test','name':'Operador','active':True,'role':'operator'}
        self.calls=[]
        def remote(path,*args,**kwargs):
            self.calls.append(path)
            if path=='/auth/v1/user':return {'id':UID}
            if path.startswith('/rest/v1/profiles'):return [self.profile]
            if path.startswith('/rest/v1/products'):return []
            if path.startswith('/rest/v1/photos'):return []
            raise AssertionError('Unexpected backend request: '+path)
        self.mock=patch.object(api,'remote',side_effect=remote);self.mock.start();self.addCleanup(self.mock.stop)
    def denied(self,token,admin=False):
        with self.assertRaises(api.APIError) as e:api.validate_session(token,admin)
        return e.exception.status
    def test_no_token_rejected_before_remote(self):
        self.assertEqual(self.denied(''),401);self.assertEqual(self.calls,[])
    def test_password_alone_never_unlocks_inventory(self):
        self.assertEqual(self.denied(jwt('aal1')),403)
        self.assertEqual(self.calls,['/auth/v1/user'])
    def test_mfa_claims_are_not_trusted_before_supabase_validation(self):
        with patch.object(api,'remote',side_effect=api.APIError('Invalid JWT',401)):
            self.assertEqual(self.denied(jwt()),401)
    def test_forged_identity_rejected(self):
        self.assertEqual(self.denied(jwt(sub='22222222-2222-4222-8222-222222222222')),403)
    def test_user_without_profile_denied(self):
        with patch.object(api,'remote',side_effect=[{'id':UID},[]]):self.assertEqual(self.denied(jwt()),403)
    def test_disabled_user_denied_even_with_valid_mfa(self):
        self.profile['active']=False;self.assertEqual(self.denied(jwt()),403)
    def test_operator_cannot_administer_users(self):self.assertEqual(self.denied(jwt(),True),403)
    def test_admin_requires_mfa_as_well(self):
        self.profile['role']='admin';self.assertEqual(self.denied(jwt('aal1'),True),403)
    def test_active_mfa_operator_can_access_inventory(self):
        self.assertEqual(api.validate_session(jwt())[0]['id'],UID)
    def test_quantity_cannot_be_negative_fractional_or_boolean(self):
        for value in [-1,1.2,True,'abc','']:
            with self.subTest(value=value),self.assertRaises(api.APIError):api.integer(value)
        self.assertEqual(api.integer('0'),0)

class HttpSecurity(Security):
    def setUp(self):
        super().setUp()
        self.server=ThreadingHTTPServer(('127.0.0.1',0),api.handler)
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
        self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
        self.url='http://127.0.0.1:'+str(self.server.server_port)
    def request(self,path,method='GET',headers=None,data=None):
        req=urllib.request.Request(self.url+path,method=method,headers=headers or {},data=data)
        try:r=urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:r=e
        return r.status,dict(r.headers),json.loads(r.read())
    def test_photos_backup_and_inventory_require_login(self):
        for path in ['/api/products','/api/photos/1','/api/backup','/api/admin/users']:
            with self.subTest(path=path):self.assertEqual(self.request(path)[0],401)
    def test_password_only_cannot_access_any_private_route(self):
        for path in ['/api/products','/api/photos/1','/api/backup']:
            with self.subTest(path=path):self.assertEqual(self.request(path,headers={'Authorization':'Bearer '+jwt('aal1')})[0],403)
    def test_operator_cannot_create_users_or_promote_itself(self):
        status,_,_=self.request('/api/admin/users','POST',{'Authorization':'Bearer '+jwt(),'Content-Type':'application/json'},b'{"email":"other@example.test","role":"admin"}')
        self.assertEqual(status,403)
    def test_cross_origin_writes_rejected(self):
        status,_,_=self.request('/api/products/1/confirm','POST',{'Authorization':'Bearer '+jwt(),'Origin':'https://untrusted.example'},b'{}')
        self.assertEqual(status,403)
    def test_cookie_only_write_requires_origin(self):
        status,_,_=self.request('/api/products/1/confirm','POST',{'Cookie':api.COOKIE+'='+jwt()},b'{}')
        self.assertEqual(status,403)
    def test_cookie_has_security_flags_and_private_response(self):
        status,headers,_=self.request('/api/auth/session','POST',{'Authorization':'Bearer '+jwt()},b'{}')
        self.assertEqual(status,200)
        for flag in ['HttpOnly','Secure','SameSite=Strict','Path=/']:self.assertIn(flag,headers['Set-Cookie'])
        self.assertIn('no-store',headers['Cache-Control'])
    def test_public_config_never_contains_service_secret(self):
        with patch.dict(os.environ,{'SUPABASE_URL':'https://project.supabase.co','SUPABASE_ANON_KEY':'public-key','SUPABASE_SERVICE_ROLE_KEY':'SECRET-DO-NOT-EXPOSE'}):
            status,_,body=self.request('/api/config')
        self.assertEqual(status,200);self.assertNotIn('SECRET-DO-NOT-EXPOSE',json.dumps(body))
    def test_no_public_signup_endpoint(self):
        status,_,_=self.request('/api/signup','POST',data=b'{}')
        self.assertIn(status,(401,403,404))

class APIKeyHeaders(unittest.TestCase):
    def response(self):
        mock=unittest.mock.MagicMock();mock.__enter__.return_value.read.return_value=b'{}';return mock
    def test_new_secret_key_never_used_as_bearer(self):
        with patch.dict(os.environ,{'SUPABASE_URL':'https://example.supabase.co','SUPABASE_ANON_KEY':'sb_publishable_test','SUPABASE_SERVICE_ROLE_KEY':'sb_secret_test'}),patch.object(api.urllib.request,'urlopen',return_value=self.response()) as request:
            api.remote('/auth/v1/admin/users',service=True)
            headers=request.call_args.args[0].headers
            self.assertNotIn('Authorization',headers);self.assertEqual(headers['Apikey'],'sb_secret_test')
    def test_user_jwt_is_sent_separately_from_publishable_key(self):
        with patch.dict(os.environ,{'SUPABASE_URL':'https://example.supabase.co','SUPABASE_ANON_KEY':'sb_publishable_test'}),patch.object(api.urllib.request,'urlopen',return_value=self.response()) as request:
            api.remote('/auth/v1/user',token='signed-user-token')
            headers=request.call_args.args[0].headers
            self.assertEqual(headers['Authorization'],'Bearer signed-user-token');self.assertEqual(headers['Apikey'],'sb_publishable_test')

if __name__=='__main__':unittest.main()
