# Publicação — Vercel + Supabase

O pacote usa o site desta pasta e um snapshot consistente do estoque atual. A aplicação local continua em `local/site` e `local/dados/estoque.db`.

## 1. Supabase novo

Criar um projeto dedicado `happy-machine-estoque`, com região próxima a São Paulo. Guardar a senha do banco em local privado. Não usar um projeto que já tenha outros dados.

Em **Authentication → Sign In / Providers**, desativar **Allow new users to sign up**. Desativar acesso anônimo. Manter login por e-mail e senha. Em MFA, habilitar cadastro e verificação de TOTP. Definir tamanho mínimo de senha de 16 caracteres. Usar apenas o provedor de e-mail/senha neste projeto.

No SQL Editor, executar nesta ordem:

1. **`supabase/schema.sql`** — tabelas, RLS, 2FA, auditoria e bucket privado.
2. **`supabase/002_dados.sql`** — os dados reais preparados desta pasta, preservando os IDs e quantidades. O SQL recusa um banco que já contenha estoque.

`002_dados.sql` não contém os binários das fotos. Eles estão em `migration/fotos_storage.zip`, com os caminhos exatos referenciados no SQL. Não remover a pasta interna `migration/` ao subir os objetos para o bucket `stock-photos`.

## 2. Transferir as fotos privadas

Copiar `.env.example` para `.env.local` e preencher:

```dotenv
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=CHAVE_PUBLICA_DO_PROJETO
SUPABASE_SERVICE_ROLE_KEY=CHAVE_SECRETA_APENAS_NO_SERVIDOR
APP_ORIGIN=https://SEU_PROJETO.vercel.app
```

Na raiz `estoque_site_local`, executar:

```powershell
python scripts/upload_prepared_photos.py
```

O script compara as tabelas com o snapshot, verifica SHA-256 de cada arquivo e transfere os objetos para o bucket privado. Pode ser retomado caso a conexão seja interrompida.

Uma alternativa para atualizar a preparação com mudanças feitas no estoque local após a entrega é executar `python scripts/prepare_migration.py` antes de usar o SQL. Isso recria `002_dados.sql`, os metadados e o ZIP das fotos a partir de um novo snapshot. Não executar o SQL em um estoque online que já esteja em uso.

## 3. Administrador inicial

E-mail: **happymachinepaulo@gmail.com**.

A senha aleatória está somente no arquivo privado local `.private/administrador-online.json`. Não está no SQL, nas páginas ou no pacote para a Vercel.

```powershell
python scripts/bootstrap_admin.py
```

O script cria a conta Auth e seu perfil administrador. Se a conta já existir, não altera sua senha. Exige que o cadastro público esteja desativado antes de continuar.

Alternativa pelo dashboard: adicionar a conta em Authentication → Users com a senha gerada e depois executar `supabase/003_administrador.sql` para atribuir o perfil. **Não executar as duas alternativas para trocar senhas.**

## 4. Vercel novo

- Usar a pasta **`estoque_site_local` inteira** como raiz do projeto.
- Root Directory: vazio (raiz do repositório), ou `.`. Não usar uma subpasta.
- Framework: **Other**.
- Output directory: **`public`**.
- Configuração: `vercel.json`.
- Não há dependências npm nem comando de build obrigatório. O SDK Supabase já está incluído em `public/assets/supabase.js`.
- Configurar as quatro variáveis acima no painel Vercel, para o ambiente de produção.
- Nunca colocar `SUPABASE_SERVICE_ROLE_KEY` no JavaScript, no diretório público nem em variável com prefixo `NEXT_PUBLIC_` ou `VITE_`.
- Os nomes das variáveis são compatíveis com as chaves antigas, mas aceitam também as chaves atuais: `sb_publishable_...` em `SUPABASE_ANON_KEY` e `sb_secret_...` em `SUPABASE_SERVICE_ROLE_KEY`. As chaves novas são enviadas apenas no header `apikey`; o header Bearer recebe o JWT do usuário.
- Publicar por CLI autenticada, executando `vercel --prod` **na raiz `estoque_site_local`**, ou usar um repositório com Root Directory vazio (raiz do repositório).
- `.vercelignore` exclui SQL, fotos de migração, scripts e arquivos de configuração privados do envio por CLI. As funções também excluem esses arquivos do bundle.
- Após obter a URL definitiva, ajustar **APP_ORIGIN** na Vercel e **Site URL** no Supabase para essa URL HTTPS, sem barra final. Fazer novo deploy se mudar variáveis da Vercel.

O ZIP de entrega contém SQL e fotos para a preparação, mas **não deve ser servido como conteúdo público**. Publicar somente a aplicação pelo fluxo Vercel, respeitando o diretório público e os arquivos ignorados.

## 5. Primeiro acesso e validação

Entrar na URL publicada com o administrador. No primeiro acesso, escanear pessoalmente o QR code no aplicativo autenticador, guardar seu backup pessoal e digitar o código atual. Nenhum estoque será liberado enquanto esse código não for validado.

Validar:

- sem login: APIs de produtos, fotos, usuários e backup recusam acesso;
- só senha, sem TOTP: API e banco recusam acesso;
- signup direto do Supabase: recusado;
- bucket `stock-photos`: privado;
- operador: usa estoque, mas não cria usuários nem altera permissões;
- administrador: cria e desativa operadores em Usuários;
- operador novo: precisa ativar o próprio autenticador;
- comparar registros e contagens com `migration/manifest.json`;
- fazer uma entrada e uma saída de teste em uma peça de teste e verificar o histórico.

Executar `python scripts/check_cloud.py` para verificar cadastro fechado, bucket privado e acesso anônimo negado. Os testes locais já cobrem a validação de tokens, MFA, conta desativada, permissões de administrador, cookies e origem de requisições; a validação no projeto real é necessária antes de considerar a publicação concluída.

## Backup

A exportação JSON da interface contém dados e referências das fotos; não contém os arquivos de imagem. Manter também backup dos objetos privados do Storage e do PostgreSQL. O SQLite original e o snapshot privado preservam as imagens anteriores à migração.

## Quando perder o autenticador

Não existe atalho para pular 2FA na aplicação. O proprietário do projeto deve recuperar o fator no painel Supabase após confirmar a identidade. O próximo login exigirá configurar um novo autenticador.
