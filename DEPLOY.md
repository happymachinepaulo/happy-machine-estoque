# Publicação — Vercel + Supabase

O pacote usa o site desta pasta e um snapshot consistente do estoque atual. A aplicação local continua em `local/site` e `local/dados/estoque.db`.

## 1. Supabase novo

Criar um projeto dedicado `happy-machine-estoque`, com região próxima a São Paulo. Guardar a senha do banco em local privado. Não usar um projeto que já tenha outros dados.

Em **Authentication → Sign In / Providers**, desativar **Allow new users to sign up**. Desativar acesso anônimo. Manter login por e-mail e senha. No provedor Email, configurar OTP com 8 dígitos e validade de 600 segundos. Em Email Templates → Magic Link, usar o modelo de código descrito abaixo. Definir tamanho mínimo de senha de 16 caracteres. Usar apenas o provedor de e-mail/senha neste projeto.

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

Entrar na URL publicada com a senha do administrador e digitar o código recebido por e-mail. Cada novo login exige as duas etapas. O código vale por 10 minutos; há no máximo 5 tentativas por desafio e um novo envio exige intervalo de 60 segundos. A autorização da sessão expira após 8 horas e é revogada ao sair. Nenhum estoque será liberado antes da confirmação.

Validar:

- sem login: APIs de produtos, fotos, usuários e backup recusam acesso;
- só senha, sem código de e-mail: API e banco recusam acesso;
- signup direto do Supabase: recusado;
- bucket `stock-photos`: privado;
- operador: usa estoque, mas não cria usuários nem altera permissões;
- administrador: cria e desativa operadores em Usuários;
- operador novo: precisa confirmar o código enviado ao próprio e-mail;
- comparar registros e contagens com `migration/manifest.json`;
- fazer uma entrada e uma saída de teste em uma peça de teste e verificar o histórico.

Executar `python scripts/check_cloud.py` para verificar cadastro fechado, bucket privado e acesso anônimo negado. Os testes locais já cobrem a validação de tokens, MFA, conta desativada, permissões de administrador, cookies e origem de requisições; a validação no projeto real é necessária antes de considerar a publicação concluída.

## Backup

Se os registros foram importados, mas as fotos não aparecem, execute `python scripts/repair_photo_storage.py` na raiz com `.env.local` ou `.env` configurado. O script transfere somente fotos preparadas cujos caminhos ainda correspondem aos registros atuais. Não altera o catálogo, não sobrescreve arquivos existentes e verifica SHA-256 após cada transferência. O bucket continua privado.

As imagens da interface usam links assinados emitidos em lote após confirmar senha e e-mail. O navegador baixa diretamente do Storage privado; os links valem por 10 minutos. A API antiga de fotos continua disponível para compatibilidade. Quem tiver um desses links poderá utilizá-lo até expirar, mesmo após o usuário sair.

Novas entregas de dados podem ser aplicadas pelo SQL Editor sem substituir o banco inteiro. O arquivo `migration/adicoes_paulo_20261008/005_fotos_paulo_revisao.sql` adiciona 28 fotos apenas em revisão (21 exemplos e 7 complementares), com nomes provisórios e sem criar produtos ou alterar quantidades. Os objetos correspondentes devem estar no bucket antes de executar o SQL. Essa entrega é privada e não vai ao GitHub nem à Vercel.

A exportação JSON da interface contém dados e referências das fotos; não contém os arquivos de imagem. Manter também backup dos objetos privados do Storage e do PostgreSQL. O SQLite original e o snapshot privado preservam as imagens anteriores à migração.

## Quando não receber o e-mail

Verifique spam e a configuração SMTP do Supabase. Aguarde 60 segundos e use Voltar / solicitar outro código para entrar novamente. Se perder acesso ao e-mail, o proprietário deve confirmar sua identidade antes de atualizar a conta pelo dashboard. Não há atalho para pular a confirmação.

## Atualização para senha + código por e-mail

Em um projeto que já recebeu o SQL anterior, execute somente `supabase/004_email_login.sql` no SQL Editor. Ele troca a proteção TOTP pela confirmação de senha + e-mail, sem alterar o estoque. Em um projeto novo, `supabase/schema.sql` já inclui essa estrutura; não é necessário executar 004 de novo.

Em Authentication → Email Templates → Magic Link, substitua o link por:

```html
<h2>Happy Machine</h2>
<p>Seu código de acesso é <strong>{{ .Token }}</strong>.</p>
<p>Válido por 10 minutos. Se não solicitou o acesso, ignore este e-mail.</p>
```

Configure um **SMTP próprio** em Authentication → SMTP Settings para enviar aos operadores. O serviço padrão do Supabase tem restrições de destinatários e limites baixos; não serve como entrega de produção para toda a equipe. Use remetente autorizado pelo seu provedor. Segredos SMTP ficam no Supabase, nunca no repositório.

O script opcional `scripts/configure_auth.py` configura o template e a expiração quando houver token da Management API; não instala nem configura um provedor SMTP automaticamente. As tabelas `email_login_challenges` e `email_login_sessions` não podem ser acessadas nem alteradas pelo navegador. Entrar diretamente pelo OTP nativo, sem a senha validada pela API, não libera o estoque.

Referências: https://supabase.com/docs/guides/auth/auth-email-passwordless e https://supabase.com/docs/guides/auth/auth-smtp.
