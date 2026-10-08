"""Optional Management API setup; never uses/extracts browser session credentials."""
from common import *
load_env()
token=os.environ.get('SUPABASE_ACCESS_TOKEN','');ref=os.environ.get('SUPABASE_PROJECT_REF','')
if not token or not ref:raise SystemExit('SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF são necessários; alternativamente configure no dashboard conectado.')
origin=os.environ.get('APP_ORIGIN','')
payload={'disable_signup':True,'external_anonymous_users_enabled':False,'mfa_totp_enroll_enabled':True,'mfa_totp_verify_enabled':True,'password_min_length':16}
if origin:payload.update(site_url=origin,uri_allow_list=origin)
request=urllib.request.Request('https://api.supabase.com/v1/projects/'+ref+'/config/auth',method='PATCH',data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
with urllib.request.urlopen(request,timeout=30) as r:config=json.load(r)
assert config['disable_signup'] is True
assert config['mfa_totp_enroll_enabled'] is True and config['mfa_totp_verify_enabled'] is True
assert_closed_signup()
print('Cadastro público e acesso anônimo desativados; TOTP habilitado.')
