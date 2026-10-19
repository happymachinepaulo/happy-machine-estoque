import unittest, importlib.util, base64, json, io, threading, urllib.request, urllib.error, os
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer

spec=importlib.util.spec_from_file_location('online_api',Path(__file__).resolve().parents[1]/'api/index.py')
api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
UID='11111111-1111-4111-8111-111111111111'
def jwt(aal='aal2',sub=UID,verified=None):
    if verified is None:verified=aal!='aal1'
    value={'sub':sub,'aal':aal,'exp':4102444800,'session_id':'email-verified-session' if verified else 'password-only-session'}
    return 'header.'+base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')+'.signature'

class Security(unittest.TestCase):
    def setUp(self):
        self.profile={'id':UID,'email':'operator@example.test','name':'Operador','active':True,'role':'operator'}
        self.calls=[]
        def remote(path,*args,**kwargs):
            self.calls.append(path)
            if path=='/auth/v1/user':return {'id':UID}
            if path=='/rest/v1/rpc/stock_access':return api.claims(kwargs['token'])['session_id']=='email-verified-session'
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
        self.assertEqual(self.calls,['/auth/v1/user','/rest/v1/rpc/stock_access'])
    def test_mfa_claims_are_not_trusted_before_supabase_validation(self):
        with patch.object(api,'remote',side_effect=api.APIError('Invalid JWT',401)):
            self.assertEqual(self.denied(jwt()),401)
    def test_forged_identity_rejected(self):
        self.assertEqual(self.denied(jwt(sub='22222222-2222-4222-8222-222222222222')),403)
    def test_user_without_profile_denied(self):
        with patch.object(api,'remote',side_effect=[{'id':UID},True,[]]):self.assertEqual(self.denied(jwt()),403)
    def test_disabled_user_denied_even_with_valid_mfa(self):
        self.profile['active']=False;self.assertEqual(self.denied(jwt()),403)
    def test_operator_cannot_administer_users(self):self.assertEqual(self.denied(jwt(),True),403)
    def test_admin_requires_mfa_as_well(self):
        self.profile['role']='admin';self.assertEqual(self.denied(jwt('aal1'),True),403)
    def test_active_mfa_operator_can_access_inventory(self):
        self.assertEqual(api.validate_session(jwt())[0]['id'],UID)
    def test_direct_email_otp_without_password_challenge_is_denied(self):
        self.assertEqual(self.denied(jwt(verified=False)),403)
    def test_native_aal2_without_email_grant_is_denied(self):
        self.assertEqual(self.denied(jwt('aal2',verified=False)),403)
    def test_validated_email_session_can_use_aal1(self):
        token=jwt('aal1',verified=True)
        self.assertEqual(api.validate_session(token)[0]['id'],UID)
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
    def test_stats_keep_meters_separate_from_units_and_exclude_pending_counts(self):
        original=api.remote.side_effect
        def backend(path,*args,**kwargs):
            if path.startswith('/rest/v1/products'):
                return [{'id':1,'name':'Motor','quantity':4,'min_quantity':0,'notes':'','review_status':'confirmado'},
                        {'id':2,'name':'Fio LED','quantity':300,'min_quantity':0,'notes':'Unidade de medida: metros.','review_status':'confirmado'},
                        {'id':3,'name':'Modelo a conferir','quantity':10,'min_quantity':0,'notes':'','review_status':'pendente'},
                        {'id':4,'name':'Lote de cabos','quantity':2,'min_quantity':0,'notes':'Unidade de medida: lote.','review_status':'confirmado'}]
            return original(path,*args,**kwargs)
        with patch.object(api,'remote',side_effect=backend):
            status,_,body=self.request('/api/stats',headers={'Authorization':'Bearer '+jwt()})
        self.assertEqual(status,200)
        self.assertEqual(body['units'],4)
        self.assertEqual(body['meters'],300)
        self.assertEqual(body['lots'],2)
        self.assertEqual(body['pending'],1)

    def test_photos_backup_and_inventory_require_login(self):
        for path in ['/api/products','/api/photos/1','/api/backup','/api/admin/users','/api/count-review']:
            with self.subTest(path=path):self.assertEqual(self.request(path)[0],401)
    def test_count_review_reads_only_pending_intake_without_stock_writes(self):
        original=api.remote.side_effect
        def backend(path,*args,**kwargs):
            if path.startswith('/rest/v1/audit_log'):
                self.assertIn('action=eq.stock_count_review',path)
                self.assertEqual(kwargs.get('token'),jwt())
                return [{'id':901,'created_at':'2026-10-19T12:00:00Z','after_data':json.dumps({'name':'MIDI','quantity':288,'note':'Sem foto; conferir vínculo.','search':'MIDI','internal_source':'not-exposed'})}]
            return original(path,*args,**kwargs)
        with patch.object(api,'remote',side_effect=backend) as mock:
            status,_,body=self.request('/api/count-review',headers={'Authorization':'Bearer '+jwt()})
            self.assertTrue(all(c.args[0]=='/rest/v1/rpc/stock_access' or len(c.args)<2 or c.args[1]=='GET' for c in mock.call_args_list))
        self.assertEqual(status,200)
        self.assertEqual(body[0]['quantity'],288)
        self.assertEqual(body[0]['name'],'MIDI')
        self.assertNotIn('internal_source',body[0])
    def test_password_only_cannot_access_any_private_route(self):
        for path in ['/api/products','/api/photos/1','/api/backup','/api/count-review']:
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
    def test_authenticated_http_mutations_dispatch_stock_rpc(self):
        original=api.remote.side_effect
        def backend(path,*args,**kwargs):
            if path=='/rest/v1/rpc/stock_command':return {'ok':True,'id':999}
            return original(path,*args,**kwargs)
        with patch.object(api,'remote',side_effect=backend) as remote:
            for path,method,body in [
                ('/api/products/999/movement','POST',{'kind':'entrada','amount':2}),
                ('/api/products/999/movement','POST',{'kind':'saida','amount':1}),
                ('/api/products/999/movement','POST',{'kind':'ajuste','new_quantity':3}),
                ('/api/products/999/confirm','POST',{}),
                ('/api/photos/99/review','POST',{'status':'pendente'}),
                ('/api/products/999','DELETE',None),
            ]:
                with self.subTest(path=path,body=body):
                    data=json.dumps(body).encode() if body is not None else None
                    status,_,result=self.request(path,method,{'Authorization':'Bearer '+jwt(),'Content-Type':'application/json'},data)
                    self.assertEqual(status,200);self.assertTrue(result['ok'])
        commands=[call.args[2]['command'] for call in remote.call_args_list if call.args[0]=='/rest/v1/rpc/stock_command']
        self.assertEqual(commands,['movement','movement','movement','confirm','review_photo','delete'])
    def test_authenticated_http_create_and_edit_parse_multipart(self):
        original=api.remote.side_effect
        def backend(path,*args,**kwargs):
            if path=='/rest/v1/rpc/stock_command':return {'ok':True,'id':999}
            return original(path,*args,**kwargs)
        boundary='test-forms'
        fields={'name':'Peça de teste','quantity':'3','min_quantity':'1'}
        content=''.join('--'+boundary+'\r\nContent-Disposition: form-data; name="'+k+'"\r\n\r\n'+v+'\r\n' for k,v in fields.items())+'--'+boundary+'--\r\n'
        with patch.object(api,'remote',side_effect=backend):
            for path,expected in [('/api/products',201),('/api/products/999/update',200)]:
                status,_,result=self.request(path,'POST',{'Authorization':'Bearer '+jwt(),'Content-Type':'multipart/form-data; boundary='+boundary},content.encode())
                self.assertEqual(status,expected);self.assertTrue(result['ok'])

    def test_duplicate_create_is_rejected_before_upload_or_stock_write(self):
        original=api.remote.side_effect
        def backend(path,*args,**kwargs):
            if path.startswith('/rest/v1/products'):return [{'id':78,'name':'Chave HR6666'}]
            return original(path,*args,**kwargs)
        boundary='duplicate-form'
        body=('--'+boundary+'\r\nContent-Disposition: form-data; name="name"\r\n\r\n CHÁVES   hr-6666 \r\n--'+boundary+'\r\nContent-Disposition: form-data; name="quantity"\r\n\r\n50\r\n--'+boundary+'--\r\n').encode()
        with patch.object(api,'remote',side_effect=backend) as backend_mock:
            status,_,result=self.request('/api/products','POST',{'Authorization':'Bearer '+jwt(),'Content-Type':'multipart/form-data; boundary='+boundary},body)
        self.assertEqual(status,409)
        self.assertIn('#78',result['error'])
        self.assertFalse(any(c.args[0].startswith('/storage/') or c.args[0]=='/rest/v1/rpc/stock_command' for c in backend_mock.call_args_list))
        self.assertNotEqual(api.product_name_key('Chave HR6666'),api.product_name_key('Chave HR8888'))

    def test_duplicate_create_checks_products_after_first_thousand(self):
        original=api.remote.side_effect
        def backend(path,*args,**kwargs):
            if path.startswith('/rest/v1/products'):
                offset=int(urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)['offset'][0])
                return [{'id':i,'name':'Peça '+str(i)} for i in range(1,1001)] if offset==0 else [{'id':1001,'name':'Chave HR6666'}]
            return original(path,*args,**kwargs)
        boundary='duplicate-pagination'
        body=('--'+boundary+'\r\nContent-Disposition: form-data; name="name"\r\n\r\nChave HR6666\r\n--'+boundary+'--\r\n').encode()
        with patch.object(api,'remote',side_effect=backend) as backend_mock:
            status,_,result=self.request('/api/products','POST',{'Authorization':'Bearer '+jwt(),'Content-Type':'multipart/form-data; boundary='+boundary},body)
        self.assertEqual(status,409)
        self.assertIn('#1001',result['error'])
        queries=[urllib.parse.parse_qs(urllib.parse.urlsplit(c.args[0]).query) for c in backend_mock.call_args_list if c.args[0].startswith('/rest/v1/products')]
        self.assertEqual([q['offset'][0] for q in queries],['0','1000'])
        self.assertFalse(any(c.args[0]=='/rest/v1/rpc/stock_command' for c in backend_mock.call_args_list))

    def test_edit_cannot_rename_into_another_product_but_keeps_own_name(self):
        original=api.remote.side_effect
        def backend(path,*args,**kwargs):
            if path.startswith('/rest/v1/products'):return [{'id':78,'name':'Chave HR6666'}]
            if path=='/rest/v1/rpc/stock_command':return {'ok':True}
            return original(path,*args,**kwargs)
        boundary='duplicate-edit'
        body=('--'+boundary+'\r\nContent-Disposition: form-data; name="name"\r\n\r\nChaves HR 6666\r\n--'+boundary+'--\r\n').encode()
        with patch.object(api,'remote',side_effect=backend) as backend_mock:
            status,_,result=self.request('/api/products/99/update','POST',{'Authorization':'Bearer '+jwt(),'Content-Type':'multipart/form-data; boundary='+boundary},body)
            self.assertEqual(status,409)
            self.assertIn('#78',result['error'])
            self.assertFalse(any(c.args[0]=='/rest/v1/rpc/stock_command' for c in backend_mock.call_args_list))
            status,_,result=self.request('/api/products/78/update','POST',{'Authorization':'Bearer '+jwt(),'Content-Type':'multipart/form-data; boundary='+boundary},body)
            self.assertEqual(status,200)
            self.assertTrue(result['ok'])

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
