# Happy Machine — versão online

**Use a pasta `estoque_site_local` inteira como raiz do projeto Vercel.** Deixe Root Directory vazio (ou `.`), Framework Other, Output Directory `public` e nenhum comando de build. Siga [DEPLOY.md](DEPLOY.md).

## Organização

| Pasta / arquivo | Finalidade |
| --- | --- |
| `public/` | Interface online, logo, estilos e JavaScript |
| `api/` | API Python autenticada |
| `vercel.json` | Configuração da Vercel |
| `supabase/` | Estrutura, segurança e SQL para importar |
| `migration/` | Fotos privadas e dados preparados |
| `scripts/` | Preparação, importação e validação |
| `tests/` | Verificações de segurança e login |
| `local/` | Aplicação original, SQLite, backups e análises |
| `.private/` | Senha inicial e snapshots privados |
| `entrega/` | ZIP atualizado para entregar ao desenvolvedor |
| `ABRIR_SITE.bat` | Abre a versão local |

Dados locais, credenciais, migração, SQL e pacote de entrega ficam fora do deploy. Execute o SQL no Supabase conforme o guia. Somente `public/` deve ser o diretório de saída público da Vercel.

Esta versão foi preparada a partir do site desta pasta. `local/site` e `local/dados/estoque.db` continuam sendo a versão local. Não há publicação nem migração automática ao abrir a página.

## Arquitetura

- Vercel: arquivos estáticos em `public` e API Python serverless em `api/index.py`.
- Supabase: Auth com senha e TOTP, PostgreSQL e bucket **privado** `stock-photos`.
- Administrador inicial: `happymachinepaulo@gmail.com`. A senha aleatória está em `.private/administrador-online.json`, fora do pacote público.
- Usuários adicionais são operadores, criados somente pelo administrador autenticado com 2FA na tela Usuários. Podem ser desativados, sem excluir histórico. Nenhuma atribuição de permissão vem de metadados editáveis pelo usuário.
- Sem sessão autenticada em nível `aal2`, a API, as políticas RLS e as operações SQL negam acesso. Uma conta Auth sem perfil ativo não tem acesso ao estoque.
- Movimentações são transacionais, com bloqueio da linha para impedir perda de contagens por uso simultâneo.
- Cookies de fotos/downloads são `HttpOnly`, `Secure`, `SameSite=Strict`; APIs também aceitam Bearer validado. Chave administrativa fica exclusivamente no servidor.

## Publicar nos projetos novos

1. Criar um projeto Supabase dedicado, região próxima a São Paulo. Nenhum plano pago é necessário para preparar o projeto; verificar limites da conta antes da criação.
2. Executar `supabase/schema.sql` **uma única vez no projeto novo**. Ele cria tabelas, políticas, comandos transacionais e armazenamento privado.
3. Em Authentication, desativar **Allow new users to sign up** e acesso anônimo; manter login por e-mail/senha. Habilitar TOTP para cadastro e verificação. O arquivo `supabase/config.toml` é para desenvolvimento local; não substitui a configuração do projeto hospedado.
4. Copiar `.env.example` para `.env.local` e configurar URL, chave pública e chave de servidor do projeto. Nunca publicar `.env.local`.
5. Executar `python scripts/migrate.py` para migrar um snapshot consistente do banco **atual**. A migração mantém IDs, quantidades, fotos, revisões, observações e histórico; não promove fotos pendentes nem cria peças com as sugestões de Paulo. Só aceita um destino vazio ou a retomada da própria migração. Verifica todos os campos após a importação.
6. Executar `python scripts/bootstrap_admin.py`. Ele só cria a conta informada ou retoma o cadastro, sem trocar senha existente. Também verifica que o cadastro público está desativado.
7. Criar o projeto Vercel com a raiz `estoque_site_local` como raiz, framework Other, output `public`, configuração em `vercel.json`. Configurar `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `APP_ORIGIN` como variáveis do projeto. Não disponibilizar a chave de servidor como variável pública.
8. Publicar; definir `APP_ORIGIN` e Site URL do Supabase para a URL HTTPS final. O administrador entra usando a senha gerada e escaneia pessoalmente o QR code no autenticador. O sistema só libera o estoque depois da confirmação do código.
9. Verificar no ambiente real: cadastro público recusado; senha sem TOTP não libera API nem imagens; operador não cria usuários; administrador cria e desativa operadores; contagens e fotos correspondem ao snapshot.

## Verificações locais

`python -m unittest discover -s tests -v`

`python scripts/preview.py` abre somente `127.0.0.1:8770`. Sem credenciais do projeto, mostra a tela de acesso e configuração pendente; não recorre ao banco local sem autenticação.

As verificações unitárias e de HTTP usam o verificador Supabase simulado. **Não substituem testes de RLS, MFA e migração no Supabase real**, que só podem ser feitos depois do acesso à conta.

## Backup e recuperação

A exportação online JSON inclui catálogo, metadados de fotos, histórico e auditoria. **Não contém os binários das fotos**. A recuperação completa exige também uma cópia dos objetos privados `stock-photos` e backup PostgreSQL. A cópia SQLite local e o snapshot da migração preservam as fotos originais. A restauração direta de SQLite foi retirada da interface online para não substituir PostgreSQL por engano. Restaurar em projeto de recuperação, validar banco e objetos, então apontar as variáveis para o destino recuperado.

## Recuperação do 2FA

O aplicativo não fornece um botão para pular ou desativar 2FA. Se o administrador perder o autenticador, o proprietário do projeto precisa validar sua identidade e recuperar o fator pelo dashboard Supabase; no acesso seguinte, um novo fator será obrigatório. Guardar o autenticador com seu backup pessoal.

## Referências

- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/guides/auth/general-configuration
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://vercel.com/docs/functions/runtimes/python

SDK local: `@supabase/supabase-js` 2.117.3, obtido do pacote oficial publicado no npm via jsDelivr. O site não precisa carregar código externo para autenticar.
