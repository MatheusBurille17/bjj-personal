# Google Drive Video Storage

Integração de armazenamento de vídeos no Google Drive, com modo híbrido
Mux/demo, upload direto para o Drive do instrutor/aluno, URLs de reprodução
efêmeras, auditoria de acessos e compartilhamento nativo do Drive.

> **Estado:** serviço, endpoints, UI, cache, retry/circuit breaker, upload
> resumable direto do navegador, persistência no Supabase e migração sob demanda
> estão implementados. Sem credenciais Google reais, a conexão do Drive retorna
> erro de configuração; os testes usam `fetch` e o cliente Drive mockados.

---

## Arquitetura

```
Usuário
  │
  ├── OAuth Google Drive (drive.file)
  │       └── providers_oauth_tokens (tokens criptografados)
  │
  ├── Upload ──► google-drive.service ──► Google Drive API v3
  │                  └── videos (metadados, provider="google_drive")
  │
  ├── Playback ─► video-storage.service ─► verifica permissão no Drive
  │                  └── token HMAC de 1h ─► /api/google-drive/embed/:token
  │                                           └── preview do Drive
  │
  └── Auditoria ─► video_access_audit
```

### Estrutura de pastas

```
Drive do instrutor/
└── Plataforma de Treinamento/
    ├── Biblioteca/
    │   └── [Técnica]/
    │       └── [Módulo]/
    │           └── video.mp4
    └── Arquivo/            ← vídeos de módulos/técnicas arquivados

Drive do aluno/
└── Vídeos Pessoais/
    └── video-pessoal.mp4
```

A tabela `drive_folder_mappings` guarda os IDs para evitar recriação. A criação
é idempotente por nome + pasta pai.

### Conexão única com o Google

O login social e o Google Drive compartilham **um único consentimento OAuth**.
Ao conectar a conta Google, os tokens são gravados em `user_google_oauth` e
espelhados em `providers_oauth_tokens`. Usuários que já tinham apenas o login
social são adotados automaticamente na primeira operação do Drive, sem novo
consentimento. As telas de configurações/perfil exibem somente um botão
“Conectar conta Google”; o card do Drive é apenas informativo (`readOnly`).

Os endpoints `/api/google-drive/oauth/*` continuam disponíveis por
compatibilidade, mas a UI usa `/api/auth/google/*`. Ao desconectar o Google, os
dois conjuntos de tokens são removidos e o usuário pode reconectar quando
quiser.

---

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | produção | OAuth Client ID (mesmo do login Google) |
| `GOOGLE_CLIENT_SECRET` | produção | OAuth Client Secret |
| `NEXT_PUBLIC_GOOGLE_DRIVE_REDIRECT_URI` | legado | `https://SEU_DOMINIO/api/google-drive/oauth/callback` (só nas rotas antigas de OAuth direto) |
| `GOOGLE_DRIVE_SCOPES` | não | Padrão `openid email https://www.googleapis.com/auth/drive.file` |
| `GOOGLE_OAUTH_SCOPES` | não | Escopos do provider Google do Supabase (padrão inclui `drive.file`) |
| `GOOGLE_DRIVE_FOLDER_ROOT` | não | Padrão `Plataforma de Treinamento` |
| `GOOGLE_DRIVE_API_KEY` | não | Chave pública opcional (não usada no OAuth do usuário) |
| `GOOGLE_DRIVE_MAX_FILE_BYTES` | não | Padrão 5GB (`5368709120`) |
| `GOOGLE_DRIVE_RETRY_BASE_MS` | não | Backoff base (padrão 1000ms) |
| `GOOGLE_DRIVE_MAX_RETRIES` | não | Tentativas (padrão 3) |
| `GOOGLE_DRIVE_CIRCUIT_BREAKER_MS` | não | Pausa após 5 falhas (padrão 5min) |
| `PLAYBACK_TOKEN_SECRET` | produção | Segredo HMAC das URLs de reprodução (fallback `AUTH_SECRET`) |
| `SUPABASE_SECRET_KEY` | produção | service role: auditoria e leitura dos tokens do Drive do proprietário (ex.: aluno vendo vídeo do professor) |
| `UPSTASH_REDIS_REST_URL` | opcional | Rate limit compartilhado entre instâncias |
| `UPSTASH_REDIS_REST_TOKEN` | opcional | Token do Upstash Redis |

Com o provider Google do Supabase Auth, o padrão é o escopo
`https://www.googleapis.com/auth/drive.file`, que dá acesso apenas aos arquivos
criados pela plataforma e evita a verificação de escopo restrito do Google. O
fluxo antigo do Drive (`/api/google-drive/oauth/*`) permanece por compatibilidade
e também delega ao Supabase Auth.

Em produção, os tokens ficam em `user_google_oauth` e `providers_oauth_tokens`
no Supabase (nunca em `.data/db.json`). O callback do app persiste os
`provider_token`/`provider_refresh_token` devolvidos pelo Supabase.

---

## Endpoints

Formato padrão: `{ data, error, meta }`.

### Drive / OAuth

| Método | Rota | Descrição |
|---|---|---|
| POST/GET | `/api/google-drive/oauth/authorize` | Inicia OAuth do Drive; `redirect_path` opcional |
| GET | `/api/google-drive/oauth/callback` | Troca code, guarda tokens e cria pastas |
| GET | `/api/google-drive/status` | Status, e-mail, drive_id, última sync e quota |
| DELETE | `/api/google-drive/disconnect` | Revoga e remove tokens |
| GET | `/api/google-drive/embed/:token` | Valida token de reprodução e redireciona ao Drive |
| POST | `/api/google-drive/upload` | Alias de `/api/videos/upload` |
| GET | `/api/google-drive/playback/:videoId` | Alias de `/api/videos/:videoId/playback-url` |

### Upload

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/videos/upload` | Legado: upload multipart (limitado a ~4,5 MB na Vercel) |
| POST | `/api/videos/upload/initialize` | Cria a sessão resumable e devolve `upload_url` |
| PUT | `upload_url` (Google) | O **navegador** envia o arquivo direto ao Drive |
| POST | `/api/videos/upload/:sessionId/complete` | Valida o arquivo no Drive e cria o vídeo no Supabase |
| POST | `/api/videos/upload/:sessionId/cancel` | Cancela a sessão |

Exemplo de upload:

```bash
curl -X POST http://localhost:3000/api/videos/upload \
  -b cookies.txt \
  -F file=@video.mp4 \
  -F title="Passagem de guarda" \
  -F destination=library \
  -F module_id=<uuid>
```

Resposta `201`:

```json
{
  "data": {
    "video_id": "uuid",
    "file_id": "drive-file-id",
    "name": "Passagem de guarda",
    "size": 524288000,
    "url": "https://drive.google.com/file/d/.../view",
    "provider": "google_drive",
    "status": "ready"
  }
}
```

### Reprodução

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/videos/:videoId/playback-url` | Verifica acesso e gera URL de 1h |
| GET | `/api/videos/:videoId/embed` | HTML/iframe responsivo (`width`, `height`) |
| GET | `/api/videos/:videoId` | Metadados; sincroniza do Drive se >24h |
| GET | `/api/student/videos/:id/playback-url` | Compatibilidade com portal do aluno |
| GET | `/api/library/videos/:id/playback` | Compatibilidade com biblioteca do professor |

Resposta:

```json
{
  "data": {
    "url": "http://localhost:3000/api/google-drive/embed/<token>",
    "playback_url": "http://localhost:3000/api/google-drive/embed/<token>",
    "expires_at": "2026-11-03T13:00:00.000Z",
    "expires_in": 3600,
    "provider": "google_drive"
  }
}
```

### Gerenciamento

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/videos` | Lista com `technique_id`, `module_id`, `archived`, `visibility`, paginação |
| PATCH | `/api/videos/:videoId` | Atualiza título/descrição e sincroniza o Drive |
| DELETE | `/api/videos/:videoId?hard=true` | Soft delete; `hard=true` remove também do Drive |
| POST | `/api/videos/:videoId/move` | Move para módulo ou `archive=true` |
| POST | `/api/videos/:videoId/share` | Compartilha no Drive por e-mail |
| GET | `/api/videos/access-audit` | Auditoria (`video_id`, `user_id`, `date_from`, `date_to`) |
| POST | `/api/videos/migrate` | Inicia job Mux → Drive |
| GET | `/api/videos/migrate/:jobId` | Progresso do job |

---

## Erros

| Código | HTTP | Mensagem |
|---|---|---|
| `invalid_file` | 415 | Formato de arquivo não suportado |
| `file_too_large` | 413 | O arquivo excede o limite de 5GB |
| `permission_denied` | 403 | Você não tem permissão para acessar este vídeo |
| `not_found` | 404 | Arquivo ou pasta não encontrado no Google Drive |
| `token_expired` | 401 | Conexão com o Drive expirou; reconecte |
| `quota_exceeded` | 413 | Espaço insuficiente no Google Drive |
| `rate_limited` | 429 | Google Drive ocupado; aguarde |
| `timeout` | 504 | Conexão lenta com o Google Drive |
| `circuit_open` | 503 | Drive pausado após erros consecutivos |
| `configuration_error` | 503 | Google Drive não configurado |

Erros técnicos completos são logados no servidor; o cliente recebe apenas a
mensagem amigável.

---

## Segurança e conformidade

- Tokens OAuth criptografados com AES-256-GCM (mesmo serviço do login Google).
- Nenhum token, código ou URL permanente é retornado ao cliente.
- URLs de reprodução são HMAC assinadas, expiram em 1h e nunca são persistidas.
- Permissões de vídeo da biblioteca: ACL da aplicação (técnica/aula/plano) +
  verificação de compartilhamento no Drive.
- Permissões de vídeo pessoal: dono e instrutor vinculado ao aluno, com
  verificação de permissão no Drive quando aplicável.
- Auditoria registra `video_id`, `user_id`, data/hora, IP, user-agent e ação.
- HTTPS obrigatório em produção; uploads e chamadas ao Drive usam HTTPS.
- Nenhuma cópia local do vídeo é mantida; apenas metadados e URLs efêmeras.

---

## Cache, retry e resiliência

- Metadados do Drive: cache em memória por 24h.
- Permissões: cache por 1h.
- Listagem de pasta: cache por 5min.
- Retry exponencial (base configurável) para 429/5xx/timeout, até 3 tentativas.
- Circuit breaker abre após 5 falhas consecutivas e pausa por 5min.
- Upload **resumable direto do navegador** para o Google Drive: o corpo não
  passa pela Vercel e não sofre o limite de 4,5 MB por requisição. O servidor
  apenas cria a sessão e finaliza o registro.
- Progresso real via `XMLHttpRequest.upload.onprogress`; sem WebSocket.
- Timeout de 30s para chamadas de metadados/API e 30min para upload server-side
  (migração).

---

## Guia rápido — instrutor

1. Abra **Configurações → Conta Google** e clique em **Conectar conta Google**.
   O mesmo consentimento autoriza o Google Drive; não há segunda autorização.
2. Autorize o acesso; a estrutura `Plataforma de Treinamento/Biblioteca` é criada
   na primeira operação do Drive.
3. Na **Biblioteca**, clique em **Upload de vídeo**, escolha o módulo, o arquivo
   (mp4/mov/webm/avi/mkv/flv/wmv, até 5GB) e envie.
4. Para liberar a alunos, compartilhe a pasta no Google Drive com o e-mail do
   aluno e conceda a técnica na plataforma.
5. Em **Acessos ao vídeo** é possível compartilhar por e-mail e ver o histórico.

## Guia rápido — aluno

1. Abra **Meu perfil → Conta Google** e conecte sua conta (o Drive é autorizado
   no mesmo consentimento).
2. Em **Meus Vídeos Pessoais**, clique em **Upload de vídeo pessoal**.
3. Para compartilhar com o professor, use o compartilhamento do Drive ou o
   endpoint de share do vídeo.
4. Vídeos da biblioteca liberados aparecem em **Biblioteca** e no plano de aula.

---

## Migração Mux → Google Drive

Use `npm run migrate:videos` (com `MIGRATION_SESSION_COOKIE` de um instrutor) ou:

1. `POST /api/videos/migrate` cria o job (`pending`);
2. `POST /api/videos/migrate/:jobId` processa **um vídeo por chamada**
   (serverless-friendly) e retorna o progresso;
3. repita a chamada até `status` ser `completed`/`failed`;
4. `GET /api/videos/migrate/:jobId` consulta o estado.

Para cada vídeo Mux do instrutor o worker:

1. baixa o arquivo de origem (`playback_url`/demo);
2. envia para a pasta do módulo no Drive;
3. atualiza `provider`, `provider_video_id`, `mux_id`, tamanho, duração e
   metadados, preservando título, descrição e associações;
4. registra sucesso/erro no job e auditoria.

Não há mais `queueMicrotask`: a execução é sob demanda, então funciona na
Vercel. Se quiser execução automática, chame o endpoint de run por um Cron Job
ou use uma fila externa (Bull/Redis).

---

## Solução de problemas

| Sintoma | Causa provável | Ação |
|---|---|---|
| `configuration_error` | Client ID/Secret ausentes | Preencha `.env.local` e reinicie |
| `redirect_uri_mismatch` | URI não cadastrada no Google Cloud | Cadastre exatamente a URI do ambiente |
| `token_expired` | Usuário revogou ou refresh falhou | Reconecte o Drive |
| `permission_denied` | Pasta/arquivo não compartilhado | Compartilhe no Drive com o e-mail do aluno |
| `quota_exceeded` | Drive sem espaço | Libere espaço ou faça upgrade |
| `circuit_open` | Muitas falhas consecutivas | Aguarde 5min ou reinicie o processo |
| Upload lento | Arquivo grande/rede | O envio é direto ao Drive; verifique a conexão do usuário |
| Upload falha antes de chegar ao Drive | CORS/rede bloqueando o PUT | Verifique o console do navegador; o fluxo resumable usa a URL do Google |

---

## Checklist de staging/produção (11.14/11.15)

- [ ] Configurar OAuth Client e redirect URI de staging.
- [ ] Aplicar `20261103_000004_google_drive_video_storage.sql`.
- [ ] Testar OAuth, upload, playback, share, delete e migração.
- [ ] Validar quota, retry, circuit breaker e logs.
- [ ] Rotacionar `PLAYBACK_TOKEN_SECRET` e chaves de criptografia.
- [ ] Monitorar logs `[google-drive]` e erros 429/5xx.
- [ ] Preparar rollback: manter vídeos Mux e `mux_id` durante a transição.
