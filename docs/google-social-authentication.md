# Google Social Authentication

Integração de login, cadastro e conexão de conta Google sobre a autenticação
existente (e-mail/senha + cookie de sessão assinado), com armazenamento seguro
dos tokens para uso futuro do Google Drive.

> **Estado no MVP:** o fluxo completo, a criptografia, o refresh, a desconexão,
> o rate limiting e a auditoria estão implementados e testados com o Google
> mockado. Credenciais reais do Google Cloud **não** estão versionadas; sem elas
> o botão exibe um erro de configuração e o login por e-mail continua funcionando.

---

## Escopos solicitados

```
openid
profile
email
https://www.googleapis.com/auth/drive
```

O escopo `drive` é necessário para o armazenamento de vídeos no Google Drive
(recurso planejado). Nenhum escopo adicional é solicitado.

---

## Fluxo

```
1. Usuário clica em "Continuar com Google" (login/signup) ou "Conectar Google" (configurações).
2. Frontend chama POST /api/auth/google/authorize (ou navega para GET equivalente).
3. Servidor gera state (32 bytes) + code_verifier PKCE, grava ambos em cookie
   HttpOnly de 10 minutos e devolve a URL do Google.
4. Google exibe o Consent Screen; o usuário autoriza ou recusa.
5. Google redireciona para /api/auth/google/callback?code=...&state=...
6. Servidor valida o state (CSRF), troca o code por tokens (PKCE), consulta o
   userinfo, criptografa os tokens (AES-256-GCM) e grava em user_google_oauth.
7. Servidor cria a sessão local (cookie assinado) e redireciona para o destino.
```

O modo **connect** exige sessão ativa e que o e-mail da conta Google seja igual
ao e-mail da conta autenticada. Caso contrário a operação é rejeitada com
`email_mismatch_on_connect`.

O mesmo consentimento também autoriza o **Google Drive** para armazenamento de
vídeos: os tokens são espelhados automaticamente para `providers_oauth_tokens`.
Não existe um segundo botão/fluxo de autorização do Drive na interface; veja
[`google-drive-video-storage.md`](google-drive-video-storage.md).

Um usuário novo criado via Google recebe, por padrão, o papel de **professor**
(mesmo fluxo da página de signup por e-mail), com perfil contendo nome e foto
retornados pelo Google. Usuários existentes mantêm seus papéis atuais.

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
{ "data": { "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?..." } }
```

`GET` equivalente responde `303` com `Location` para o Google (fallback sem JS).

Erros: `400` parâmetros inválidos, `401` connect sem sessão, `429` rate limit,
`503` Google OAuth não configurado.

### `GET /api/auth/google/callback`

Recebe `code`, `state`, `error` e `error_description` do Google. Em sucesso,
cria a sessão e responde `303` para o destino. Em falha, responde `303` para
`/login?error=<código>` (ou para `/settings`/`/portal/profile` no modo connect)
com um código amigável.

### `POST /api/auth/google/disconnect`

Requer sessão. Revoga o refresh token no Google (best effort), limpa os tokens
armazenados, marca `is_connected = false` e registra auditoria.

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
token; caso contrário retorna a expiração atual.

```json
{ "data": { "success": true, "token_refreshed": true, "expires_at": "2026-11-03T13:00:00.000Z" } }
```

Se o refresh token foi revogado (`invalid_grant`/401), a conta é marcada como
desconectada e a resposta é `401` com `details.error = "token_refresh_failed"`.

---

## Códigos de erro

| Código                          | HTTP | Significado                                              |
|---------------------------------|------|----------------------------------------------------------|
| `access_denied`                 | 400  | Usuário recusou a autorização no Google                  |
| `invalid_request`               | 400  | Parâmetros ausentes/inválidos                            |
| `invalid_code`                  | 400  | Authorization code inválido, expirado ou já usado        |
| `invalid_scope`                 | 400  | Escopo inválido ou não autorizado no projeto             |
| `email_mismatch_on_connect`     | 409  | E-mail Google diferente do e-mail da conta               |
| `email_already_exists`          | 409  | Identidade Google já vinculada a outro usuário           |
| `invalid_grant` / `invalid_token` | 401 | Refresh token revogado/inválido                        |
| `token_refresh_failed`          | 401  | Falha de renovação; reconexão necessária                 |
| `state_not_found`               | 400  | Cookie de state ausente                                  |
| `state_mismatch`                | 400  | State divergente (possível CSRF)                         |
| `state_expired`                 | 400  | State com mais de 10 minutos                             |
| `configuration_error`           | 503  | Credenciais do Google ausentes                           |
| `invalid_client`                | 503  | Client ID/secret inválidos                               |
| `network_error`                 | 503  | Falha de rede ao falar com o Google                      |
| `server_error`                  | 503  | Google indisponível                                     |
| `revocation_failed`             | 503  | Google recusou a revogação                               |
| `rate_limited`                  | 429  | Limite de 10 requisições/minuto por IP                   |

Os erros da API seguem `{ data: null, error: { code, message, details }, meta }`.

---

## Variáveis de ambiente

| Variável                           | Obrigatória | Descrição |
|------------------------------------|-------------|-----------|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`     | produção    | OAuth Client ID (Web application) |
| `GOOGLE_CLIENT_SECRET`             | produção    | OAuth Client Secret (nunca no cliente) |
| `NEXT_PUBLIC_GOOGLE_REDIRECT_URI`  | recomendada | Deve ser exatamente `https://SEU_DOMINIO/api/auth/google/callback` em produção |
| `GOOGLE_TOKEN_ENCRYPTION_KEY`      | produção    | Chave dedicada AES-256-GCM (mín. 32 caracteres). Sem ela, usa `AUTH_SECRET` (apenas dev) |
| `GOOGLE_TOKEN_ENCRYPTION_SALT`     | não         | Salt do PBKDF2 (padrão `bjj-google-oauth-salt-v1`) |
| `GOOGLE_OAUTH_SCOPES`              | não         | Sobrescreve os quatro escopos padrão (separados por espaço) |
| `OAUTH_RATE_LIMIT_MAX`             | não         | Requisições por janela (padrão `10`) |
| `OAUTH_RATE_LIMIT_WINDOW_MS`       | não         | Janela em ms (padrão `60000`) |

Gere a chave de criptografia com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Use chaves **diferentes** para development e production.

---

## Configuração do Google Cloud

1. Acesse <https://console.cloud.google.com/> e crie/selecione um projeto.
2. Em **APIs & Services → Library**, habilite a **Google Drive API**.
3. Em **OAuth consent screen**, configure:
   - tipo **External** (ou Internal para Workspace);
   - nome do app, e-mail de suporte e domínios autorizados;
   - escopos `openid`, `profile`, `email` e
     `https://www.googleapis.com/auth/drive`;
   - usuários de teste enquanto o app estiver em **Testing**.
4. Em **Credentials → Create credentials → OAuth client ID** escolha
   **Web application**.
5. Em **Authorized redirect URIs**, adicione:
   - `http://localhost:3000/api/auth/google/callback` (desenvolvimento);
   - `https://SEU_DOMINIO/api/auth/google/callback` (staging/produção).
6. Copie o Client ID e o Client Secret para `.env.local` (veja `.env.example`).
7. Aplique as migrações:

```bash
supabase db push
# ou execute manualmente:
# supabase/migrations/20261029_000001_initial_schema.sql
# supabase/migrations/20261103_000003_google_oauth.sql
```

8. Reinicie o servidor (`npm run dev`) e teste o botão na tela de login.

---

## Segurança

- **Criptografia:** AES-256-GCM; chave derivada por PBKDF2-SHA256 (120 mil
  iterações); IV aleatório de 12 bytes por token; auth tag incluída no Base64.
  `token_iv` guarda `<iv-access>:<iv-refresh>` para nunca reutilizar nonce.
- **CSRF:** `state` aleatório de 32 bytes, cookie `HttpOnly`, expiração de 10
  minutos e uso único. O cookie é limpo mesmo em falha.
- **PKCE:** `S256` (RFC 7636), com `code_verifier` de 43–128 caracteres.
- **Uso único do code:** o Google já impõe; adicionalmente o servidor mantém
  `oauth_used_authorization_codes` com SHA-256 do código.
- **Rate limiting:** 10 req/min por IP em authorize/callback/disconnect/refresh,
  com headers `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` e
  `X-RateLimit-Reset`. Em serverless multi-instância, troque o store em memória
  por Redis/Upstash.
- **HTTPS:** em produção, endpoints OAuth exigem `https` (considera
  `x-forwarded-proto`) e a `redirect_uri` precisa ser `https`.
- **Tokens:** nunca aparecem em logs, erros ou respostas; a auditoria grava
  apenas evento, user_id, IP, user-agent e metadados redigidos.
- **SameSite:** o cookie de state usa `SameSite=Lax` (e não `Strict`) porque o
  retorno do Google é uma navegação top-level cross-site. `Strict` impediria o
  callback de funcionar; a proteção CSRF efetiva vem do `state`.
- **RLS:** `user_google_oauth` permite select/insert/update/delete apenas do
  próprio `user_id`; `oauth_audit_logs` é somente leitura do próprio usuário;
  a tabela de codes usados não tem grants para `authenticated`/`anon`.

---

## Testes

```bash
npm test
npm run test:rls
```

Arquivos específicos:

| Arquivo | Conteúdo |
|---------|----------|
| `tests/google-oauth.test.ts` | criptografia, state/PKCE, cliente Google, serviço, rotas e integração |
| `tests/google-oauth-properties.test.ts` | Propriedades 1–12 com fast-check (100+ iterações) |
| `tests/google-oauth-components.test.tsx` | componentes de UI (login, status, diálogo, alerta e seção) |
| `tests/rls.test.ts` | RLS real em PGlite para `user_google_oauth` e auditoria |

---

## Checklist de staging/produção (tasks 9.2–9.4)

Estes passos dependem de infraestrutura externa e **não são executáveis** neste
repositório sem uma conta Google Cloud e um ambiente de deploy:

- [ ] Criar projeto Google Cloud de teste e credenciais OAuth de teste.
- [ ] Configurar `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e
      `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` no ambiente de staging.
- [ ] Aplicar a migração `20261103_000003_google_oauth.sql`.
- [ ] Testar login, cadastro, connect, disconnect e rate limiting em staging.
- [ ] Rotacionar para as credenciais/chave de produção e configurar a
      redirect URI de produção no Google Cloud.
- [ ] Executar os testes de aceite: login novo, login existente, cadastro,
      conexão com conta existente, desconexão e reconexão após revogação.

Sem credenciais configuradas, o endpoint de autorização responde `503` com
`configuration_error` e a interface exibe uma mensagem clara; o login por
e-mail/senha permanece disponível.
