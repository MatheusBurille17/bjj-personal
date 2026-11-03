# Google Social Authentication (Supabase Auth)

Login, cadastro e conexão de conta Google usando o **provider Google do
Supabase Auth**. O Supabase cuida do `state`, PKCE e da troca do código; a
aplicação recebe o callback, garante perfil/professor, persiste os tokens do
Google (para o Drive) e mantém o cookie de visão ativa (professor/aluno).

> **Requisitos:** Supabase configurado (`NEXT_PUBLIC_SUPABASE_URL` + chave
> pública) e o provider Google habilitado no painel do Supabase. Sem isso o
> botão responde `503 configuration_error`; o login por e-mail continua
> funcionando.

---

## Fluxo

```
1. Usuário clica em "Continuar com Google" (login/signup) ou "Conectar Google".
2. Frontend chama POST /api/auth/google/authorize (ou navega para o GET).
3. O servidor chama supabase.auth.signInWithOAuth. No modo connect ele guarda
   em cookie o e-mail da conta logada para validar o retorno.
4. O Supabase redireciona ao Google e recebe o retorno em
   https://<PROJECT_REF>.supabase.co/auth/v1/callback.
5. O Supabase redireciona ao app:
   https://SEU_DOMINIO/api/auth/google/callback?code=...&next=...
6. O app chama supabase.auth.exchangeCodeForSession(code), garantindo a sessão
   Supabase (cookies HTTP-only).
7. Perfil e professor são criados para novos usuários Google; os tokens
   `provider_token`/`provider_refresh_token` são criptografados e gravados em
   user_google_oauth e providers_oauth_tokens.
8. O app define o cookie de visão ativa e redireciona para `next`, `/dashboard`
   ou `/portal`.
```

O modo **connect** usa o mesmo `signInWithOAuth` (necessário para receber
`provider_token`/`provider_refresh_token`; o `linkIdentity` ainda não expõe esses
tokens). O e-mail da conta Google é comparado com o e-mail da conta logada; se
for diferente, a sessão trocada é encerrada e a API responde
`email_mismatch_on_connect`. Quando o e-mail coincide, o Supabase vincula a
identidade automaticamente.

O mesmo consentimento também autoriza o **Google Drive**: os tokens são
espelhados automaticamente para `providers_oauth_tokens`. Veja
[`google-drive-video-storage.md`](google-drive-video-storage.md).

Novos usuários criados via Google recebem o papel de **professor** (o mesmo
padrão do cadastro por e-mail). Usuários existentes mantêm seus papéis; quem
ainda não tem vínculo ativo recebe `403`.

---

## Endpoints

Todas as rotas usam o formato padrão:

```json
{ "data": {}, "error": null, "meta": { "timestamp": "2026-11-03T12:00:00.000Z" } }
```

### `POST /api/auth/google/authorize`

Inicia o fluxo. Parâmetros opcionais na query string:

| Parâmetro       | Tipo    | Descrição                                             |
|-----------------|---------|-------------------------------------------------------|
| `redirect_path` | string  | Caminho interno após o login (ex.: `/dashboard`)      |
| `connect_mode`  | boolean | `true` para vincular Google à conta autenticada        |

Resposta `200`:

```json
{ "data": { "authorization_url": "https://<project>.supabase.co/auth/v1/authorize?provider=google&..." } }
```

`GET` equivalente responde `303` com `Location` para o Supabase (fallback sem
JS).

Erros: `400` parâmetros inválidos, `401` connect sem sessão, `429` rate limit,
`503` Supabase/provider Google não configurado.

### `GET /api/auth/google/callback`

Recebe `code`, `error`, `error_description`, `next` e `connect` do Supabase.
Em sucesso, cria a sessão Supabase, persiste os tokens e responde `303` para o
destino. Em falha, responde `303` para `/login?error=<código>` (ou para
`/settings`/`/portal/profile` no modo connect) com um código amigável.

### `POST /api/auth/google/disconnect`

Requer sessão. Revoga o refresh token no Google (best effort), remove os tokens
de `user_google_oauth` e `providers_oauth_tokens` e registra auditoria.

Resposta `200`:

```json
{
  "data": {
    "success": true,
    "message": "Conta Google desconectada",
    "connected": false,
    "revocation_succeeded": true
  }
}
```

Erros: `401` sem sessão, `404` sem conta conectada. Se a revogação no Google
falhar, os tokens locais ainda são removidos e `revocation_succeeded` é `false`.

### `POST /api/auth/google/token/refresh`

Requer sessão. Se o access token expira em até 5 minutos, renova via refresh
token do Google; caso contrário retorna a expiração atual.

```json
{ "data": { "success": true, "token_refreshed": true, "expires_at": "2026-11-03T13:00:00.000Z" } }
```

Se o refresh token foi revogado (`invalid_grant`/401), os tokens são removidos e
a resposta é `401` com `details.error = "token_refresh_failed"`.

---

## Códigos de erro

| Código                          | HTTP | Significado                                              |
|---------------------------------|------|----------------------------------------------------------|
| `access_denied`                 | 400  | Usuário recusou a autorização no Google                  |
| `invalid_request`               | 400  | Parâmetros ausentes/inválidos                            |
| `invalid_code`                  | 400  | Código inválido, expirado ou fluxo PKCE perdido          |
| `invalid_scope`                 | 400  | Escopo inválido ou não autorizado no projeto             |
| `email_mismatch_on_connect`     | 409  | E-mail Google diferente do e-mail da conta               |
| `email_already_exists`          | 409  | Identidade Google já vinculada a outro usuário           |
| `invalid_grant` / `invalid_token` | 401 | Refresh token revogado/inválido                        |
| `token_refresh_failed`          | 401  | Falha de renovação; reconexão necessária                 |
| `configuration_error`           | 503  | Supabase/provider Google/redirect URL não configurado    |
| `network_error`                 | 503  | Falha de rede ao falar com o Google                      |
| `server_error`                  | 503  | Google ou Supabase indisponível                          |
| `revocation_failed`             | 503  | Google recusou a revogação                               |
| `rate_limited`                  | 429  | Limite de 10 requisições/minuto por IP                   |

Os erros da API seguem `{ data: null, error: { code, message, details }, meta }`.

---

## Variáveis de ambiente

| Variável                           | Obrigatória | Descrição |
|------------------------------------|-------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL`         | produção    | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | produção | Publishable/anon key |
| `SUPABASE_SECRET_KEY`              | recomendada | Secret key (server-only) para auditoria e operações administrativas |
| `NEXT_PUBLIC_APP_URL`              | produção    | `https://SEU_DOMINIO` (usada no `redirectTo`) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`     | produção    | Mesmo Client ID configurado no Supabase (usado no refresh do Drive) |
| `GOOGLE_CLIENT_SECRET`             | produção    | Mesmo Client Secret configurado no Supabase |
| `GOOGLE_TOKEN_ENCRYPTION_KEY`      | produção    | Chave dedicada AES-256-GCM (mín. 32 caracteres) |
| `GOOGLE_TOKEN_ENCRYPTION_SALT`     | não         | Salt do PBKDF2 (padrão `bjj-google-oauth-salt-v1`) |
| `GOOGLE_OAUTH_SCOPES`              | não         | Padrão `openid email profile https://www.googleapis.com/auth/drive.file` |
| `OAUTH_RATE_LIMIT_MAX`             | não         | Requisições por janela (padrão `10`) |
| `OAUTH_RATE_LIMIT_WINDOW_MS`       | não         | Janela em ms (padrão `60000`) |

Gere a chave de criptografia com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Use chaves **diferentes** para development e production.

> `NEXT_PUBLIC_*` é embutido no build. Na Vercel, altere e faça um **novo
> deployment** para o valor valer.

---

## Configuração do Google Cloud

1. Acesse <https://console.cloud.google.com/> e crie/selecione um projeto.
2. Em **APIs & Services → Library**, habilite a **Google Drive API**.
3. Em **OAuth consent screen**, configure:
   - tipo **External** (ou Internal para Workspace);
   - nome do app, e-mail de suporte e domínios autorizados;
   - escopos `openid`, `email`, `profile` e
     `https://www.googleapis.com/auth/drive.file`;
   - usuários de teste enquanto o app estiver em **Testing**.
4. Em **Credentials → Create credentials → OAuth client ID** escolha
   **Web application**.
5. Em **Authorized redirect URIs**, adicione a URL do Supabase:
   - `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
6. Authorized JavaScript origins: `https://SEU_DOMINIO` (e
   `http://localhost:3000` em desenvolvimento).

> Não use `https://SEU_DOMINIO/api/auth/google/callback` no Google Cloud quando
> estiver usando o provider do Supabase: quem recebe o retorno do Google é o
> Supabase.

---

## Configuração do Supabase

1. **Authentication → Providers → Google**: habilite e cole o Client ID e o
   Client Secret do Google Cloud.
2. **Authentication → URL Configuration → Redirect URLs**: adicione
   `https://SEU_DOMINIO/api/auth/google/callback` e, se usar as rotas legadas
   do Drive, `https://SEU_DOMINIO/api/google-drive/oauth/callback`.
3. Garanta que o e-mail da conta Google é o mesmo da conta já autenticada ao
   usar "Conectar conta Google" (o servidor valida e encerra a sessão trocada
   em caso de divergência).
4. Aplique as migrações:

```bash
supabase db push
# ou execute manualmente:
# supabase/migrations/20261029_000001_initial_schema.sql
# supabase/migrations/20261103_000003_google_oauth.sql
# supabase/migrations/20261103_000004_google_drive_video_storage.sql
```

5. Garanta que `SUPABASE_SECRET_KEY` está configurada no servidor para a
   auditoria (`oauth_audit_logs` só tem grant de SELECT para `authenticated`).

---

## Segurança

- **State/PKCE:** gerenciados pelo Supabase Auth (cookie de code verifier
  HTTP-only). O app não mantém um state próprio.
- **Tokens:** AES-256-GCM; chave derivada por PBKDF2-SHA256 (120 mil
  iterações); IV aleatório de 12 bytes por token; auth tag incluída no Base64.
  `token_iv` guarda `<iv-access>:<iv-refresh>`.
- **Sessão:** cookies do Supabase Auth (`HttpOnly`, `SameSite=Lax`, `Secure` em
  produção). O cookie `bjj_active_role` é apenas uma dica de navegação.
- **Rate limiting:** 10 req/min por IP em authorize/callback/disconnect/refresh,
  com headers `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` e
  `X-RateLimit-Reset`. Em serverless multi-instância, troque o store em memória
  por Redis/Upstash.
- **HTTPS:** em produção, endpoints OAuth exigem `https` (considera
  `x-forwarded-proto`).
- **Tokens:** nunca aparecem em logs, erros ou respostas; a auditoria grava
  apenas evento, user_id, IP, user-agent e metadados redigidos.
- **RLS:** `user_google_oauth` e `providers_oauth_tokens` permitem apenas o
  próprio `user_id`; `oauth_audit_logs` é somente leitura do próprio usuário e a
  escrita usa a service role.

---

## Testes

```bash
npm test
npm run test:rls
```

Arquivos específicos:

| Arquivo | Conteúdo |
|---------|----------|
| `tests/google-oauth.test.ts` | criptografia, cliente Google, serviço local, rotas e integração |
| `tests/google-oauth-properties.test.ts` | Propriedades 1–12 com fast-check (100+ iterações) |
| `tests/google-oauth-components.test.tsx` | componentes de UI (login, status, diálogo, alerta e seção) |
| `tests/rls.test.ts` | RLS real em PGlite para `user_google_oauth` e auditoria |

Os testes do serviço local usam o repositório JSON (`BJJ_STORE=memory`) e não
exercitam o Supabase real; o fluxo de produção é validado em staging.

---

## Checklist de staging/produção

- [ ] Criar projeto Google Cloud e credenciais OAuth.
- [ ] Habilitar o provider Google no Supabase com as mesmas credenciais.
- [ ] Cadastrar a redirect URI do Supabase no Google Cloud.
- [ ] Adicionar as Redirect URLs do app no Supabase.
- [ ] Aplicar as migrações `20261103_000003` e `20261103_000004`.
- [ ] Configurar `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`,
      `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` e
      `SUPABASE_SECRET_KEY` na Vercel.
- [ ] Fazer um novo deployment (variáveis `NEXT_PUBLIC_*` são embutidas no build).
- [ ] Testar login novo, login existente, cadastro, conectar, desconectar e
      reconectar após revogação.
