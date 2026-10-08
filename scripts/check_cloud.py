"""Post-setup smoke checks. No real user is created by this script."""
from common import *
load_env();assert_closed_signup()
bucket=remote('/storage/v1/bucket/stock-photos')
assert bucket['public'] is False,'Fotos não podem estar em bucket público'
for table in ['products','photos','movements','profiles','audit_log']:
    try:result=remote('/rest/v1/'+table+'?select=*&limit=1',service=False)
    except RemoteError as error:
        if error.status in (401,403):continue
        raise
    assert not result,f'Tabela {table} expõe dados para acesso anônimo'
print('Cadastro público desativado; bucket privado; tabelas inacessíveis para anônimos.')
print('Concluir teste real de senha + código por e-mail e permissões do operador antes de usar em produção.')
