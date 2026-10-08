import unittest, json, base64, io, hashlib
from unittest.mock import patch
from test_security import api, UID

SID='33333333-3333-4333-8333-333333333333'
def token():
    claim={'sub':UID,'session_id':SID,'aal':'aal1','exp':4102444800}
    return 'header.'+base64.urlsafe_b64encode(json.dumps(claim).encode()).decode().rstrip('=')+'.signature'

class EmailLogin(unittest.TestCase):
    def setUp(self):
        self.handler=object.__new__(api.handler)
        self.handler.respond=lambda data,**kwargs:data
        self.challenge='A'*43
        self.session={'user':{'id':UID,'email':'qa@example.test'},'access_token':token(),'refresh_token':'refresh'}
    def test_wrong_password_never_sends_email(self):
        with patch.object(api,'remote',side_effect=api.APIError('Bad password',400)) as remote:
            with self.assertRaises(api.APIError):self.handler.email_login('/api/auth/login',{'email':'qa@example.test','password':'wrong'})
        self.assertEqual(remote.call_count,1)
    def test_disabled_account_never_sends_email(self):
        with patch.object(api,'remote',side_effect=[self.session,[{'active':False}]]) as remote:
            with self.assertRaises(api.APIError):self.handler.email_login('/api/auth/login',{'email':'qa@example.test','password':'correct'})
        self.assertEqual(remote.call_count,2)
    def test_login_returns_only_challenge_and_disables_signup(self):
        with patch.object(api,'remote',side_effect=[self.session,[{'active':True}],{'ok':True},{},None]) as remote:
            result=self.handler.email_login('/api/auth/login',{'email':'qa@example.test','password':'correct'})
        self.assertEqual(set(result),{'challenge','expiresIn'})
        self.assertEqual(len(result['challenge']),43)
        self.assertEqual(remote.call_args_list[3].args[2],{'email':'qa@example.test','create_user':False})
        self.assertNotIn(result['challenge'],json.dumps(remote.call_args_list[2].args[2]))
    def test_rate_limit_prevents_email_send(self):
        with patch.object(api,'remote',side_effect=[self.session,[{'active':True}],api.APIError('Aguarde 60 segundos',400)]) as remote:
            with self.assertRaises(api.APIError):self.handler.email_login('/api/auth/login',{'email':'qa@example.test','password':'correct'})
        self.assertEqual(remote.call_count,3)
    def test_expired_or_exhausted_challenge_never_verifies_code(self):
        with patch.object(api,'remote',side_effect=api.APIError('Expired',400)) as remote:
            with self.assertRaises(api.APIError):self.handler.email_login('/api/auth/verify',{'challenge':self.challenge,'code':'123456'})
        self.assertEqual(remote.call_count,1)
    def test_wrong_code_counts_attempt_before_validation(self):
        with patch.object(api,'remote',side_effect=[{'user_id':UID,'email':'qa@example.test'},api.APIError('Invalid',400)]) as remote:
            with self.assertRaises(api.APIError):self.handler.email_login('/api/auth/verify',{'challenge':self.challenge,'code':'000000'})
        self.assertEqual(remote.call_args_list[0].args[2]['action'],'attempt')
        self.assertEqual(remote.call_count,2)
    def test_email_identity_mismatch_never_grants_access(self):
        with patch.object(api,'remote',side_effect=[{'user_id':UID,'email':'qa@example.test'},self.session,{'id':'other'}]) as remote:
            with self.assertRaises(api.APIError):self.handler.email_login('/api/auth/verify',{'challenge':self.challenge,'code':'123456'})
        self.assertEqual(remote.call_count,3)
    def test_verified_session_bound_to_password_challenge(self):
        with patch.object(api,'remote',side_effect=[{'user_id':UID,'email':'qa@example.test'},self.session,{'id':UID},{'ok':True}]) as remote:
            result=self.handler.email_login('/api/auth/verify',{'challenge':self.challenge,'code':'123456'})
        grant=remote.call_args_list[-1].args[2]
        self.assertEqual(grant,{'action':'complete','secret_hash':hashlib.sha256(self.challenge.encode()).hexdigest(),'uid':UID,'sid':SID})
        self.assertEqual(result['access_token'],token())
    def test_malformed_code_or_challenge_never_calls_supabase(self):
        with patch.object(api,'remote') as remote:
            for data in ({'challenge':'short','code':'123456'},{'challenge':self.challenge,'code':'abc'},{'challenge':[],'code':'123456'}):
                with self.assertRaises(api.APIError):self.handler.email_login('/api/auth/verify',data)
        remote.assert_not_called()

class SMTPFailure(unittest.TestCase):
    def test_supabase_email_failure_has_actionable_message(self):
        import urllib.error,os
        error=urllib.error.HTTPError('https://test.supabase.co/auth/v1/otp',500,'Error',{},io.BytesIO(b'{"msg":"Error sending magic link email"}'))
        with patch.dict(os.environ,{'SUPABASE_URL':'https://test.supabase.co','SUPABASE_ANON_KEY':'test-public-key'}),patch.object(api.urllib.request,'urlopen',side_effect=error):
            with self.assertRaises(api.APIError) as result:api.remote('/auth/v1/otp','POST',{'email':'qa@example.test','create_user':False})
        self.assertEqual(result.exception.status,503)
        self.assertIn('SMTP',result.exception.message)
        self.assertIn('60 segundos',result.exception.message)

if __name__=='__main__':unittest.main()
