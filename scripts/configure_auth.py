"""Optional Management API setup; never uses/extracts browser session credentials."""
from common import *
load_env()
token=os.environ.get('SUPABASE_ACCESS_TOKEN','');ref=os.environ.get('SUPABASE_PROJECT_REF','')
if not token or not ref:raise SystemExit('SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF são necessários; alternativamente configure no dashboard conectado.')
origin=os.environ.get('APP_ORIGIN','')
payload={'disable_signup':True,'external_anonymous_users_enabled':False,'password_min_length':16,'mailer_otp_exp':600,'mailer_otp_length':8,'mailer_subjects_magic_link':'Seu código de acesso — Happy Machine','mailer_templates_magic_link_content':'<h2>Happy Machine</h2><p>Seu código de acesso é:</p><p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p><p>Válido por 10 minutos. Se você não solicitou este acesso, ignore este e-mail.</p>'}
if origin:payload.update(site_url=origin,uri_allow_list=origin)
request=urllib.request.Request('https://api.supabase.com/v1/projects/'+ref+'/config/auth',method='PATCH',data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
with urllib.request.urlopen(request,timeout=30) as r:config=json.load(r)
assert config['disable_signup'] is True
assert config['mailer_otp_exp']==600
assert_closed_signup()
print('Cadastro público e acesso anônimo desativados; código de e-mail configurado. Configure também um SMTP para entrega em produção.')
