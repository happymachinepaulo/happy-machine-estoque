from common import *
load_env();assert_closed_signup()
credentials=json.loads((PRIVATE/'administrador-online.json').read_text(encoding='utf-8'))
email=credentials['email']
users=remote('/auth/v1/admin/users?page=1&per_page=1000').get('users',[])
existing=next((u for u in users if u['email'].lower()==email.lower()),None)
if existing:
    uid=existing['id']
else:
    user=remote('/auth/v1/admin/users','POST',{'email':email,'password':credentials['password'],'email_confirm':True,'user_metadata':{'name':'Paulo — Happy Machine'}})
    uid=user['id']
remote('/rest/v1/profiles?on_conflict=id','POST',{'id':uid,'email':email,'name':'Paulo','role':'admin','active':True},headers={'Prefer':'resolution=merge-duplicates,return=minimal'})
print('Administrador configurado. Senha no arquivo privado local; senha + código por e-mail obrigatórios em cada novo login. Nenhuma senha existente foi alterada.')
