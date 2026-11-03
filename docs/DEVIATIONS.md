# Desvios e decisões de implementação

Este documento registra as diferenças entre os seis conjuntos de specs (`.kiro/specs`) e o MVP implementado, além de decisões tomadas durante a execução.

## 1. Runtime local em vez de Supabase ao vivo

**Spec:** Supabase Auth, PostgreSQL com RLS e Supabase Storage como runtime.

**Implementado:** o app roda por padrão com:
- autenticação própria (senha `scrypt`, cookie de sessão assinado com HMAC);
- repositório JSON persistido em `.data/db.json`;
- avatares como data URL no perfil;
- caixa de saída de e-mail local.

**Motivo:** não havia instância Supabase nem credenciais no ambiente de execução. O schema PostgreSQL completo, as políticas RLS, o bucket de avatares e os clientes Supabase (`lib/supabase/*`) foram entregues em `supabase/migrations` e `lib/supabase` para a migração de produção.

**Impacto:** as regras de autorização são aplicadas no servidor (services e rotas), não pelo banco no modo local. O RLS é validado automatizadamente com PostgreSQL real em WASM (PGlite): o schema base e as políticas são aplicados, os papéis `authenticated`/`anon` são simulados e as consultas diretas são executadas. O que ainda não é exercitado é a integração viva com Supabase Auth/Storage; as políticas de Storage são entregues na migração.

**Para produção:** configurar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, aplicar as migrações e substituir o repositório local pelo adaptador Supabase. As interfaces de domínio já seguem o schema.

## 2. Portal do aluno em `/portal/*`

**Spec (structure.md):** grupos `(teacher)` e `(student)` com `dashboard`, `my-agenda`, `my-plan` etc.

**Implementado:** professor em `/dashboard`, `/students`, `/plans`, `/schedule`, `/library`, `/settings`; aluno em `/portal`, `/portal/agenda`, `/portal/plan`, `/portal/library`, `/portal/history`, `/portal/profile`.

**Motivo:** `(teacher)/dashboard` e `(student)/dashboard` colidiriam no mesmo caminho `/dashboard` no App Router. O prefixo `/portal` resolve o conflito sem perder a separação por layout/rota.

## 3. Componentes consolidados

**Spec:** componentes com nomes específicos (`StudentTable`, `WeeklyView`, `PlanDayEditor`, `TechniqueTree`, `VideoUploader`, `StudentDashboard`, `LessonDetailView` etc.).

**Implementado:** componentes funcionais equivalentes, porém consolidados para reduzir duplicação:
- `components/students/students-view.tsx` e `student-detail-view.tsx`
- `components/plans/plans-view.tsx`, `plan-detail-view.tsx`, `plan-form.tsx`, `plan-day-form.tsx`
- `components/schedule/schedule-view.tsx`, `lesson-form.tsx`, `lesson-detail-dialog.tsx`
- `components/library/library-view.tsx`
- `components/portal/student-*-view.tsx`, `student-lesson-dialog.tsx`, `student-video-player.tsx`

A funcionalidade descrita nas tasks foi entregue; a divisão em arquivos menores não altera contratos ou comportamento.

## 4. Vídeo/Mux

**Spec:** upload direto na Mux, webhook assinado e playback com URL assinada de 24h.

**Implementado:**
- `POST /api/library/videos/upload` cria direct upload quando as chaves Mux existem; no modo demo devolve uma mídia pública de exemplo.
- Cadastro de metadados cria o vídeo com status escolhido (`ready`, `processing` etc.).
- Webhook valida assinatura HMAC quando `MUX_WEBHOOK_SECRET` está configurado.
- `lib/mux/playback.ts` assina JWT RS256 quando há chave de assinatura; caso contrário usa a URL de demonstração.
- Endpoint extra `POST /api/library/videos/[id]/status` simula a mudança de status no demo.

**Impacto:** não há upload binário real no modo local. A interface e os estados de processamento estão implementados.

## 5. E-mail/Resend

**Spec:** envio de convites e recuperação via Resend.

**Implementado:** integração pronta em `lib/resend/*`; sem `RESEND_API_KEY`, os e-mails são gravados em `email_outbox` e exibidos na **caixa de saída de demonstração** (`/api/dev/outbox`, disponível apenas fora de produção).

**Impacto:** nenhum e-mail real é enviado no modo local. O fluxo de token, expiração e aceite é completo.

## 6. Notas privadas e RLS

**Spec:** RLS impediria o aluno de consultar `private_notes`.

**Implementado:**
- a coluna `private_notes` foi **revogada** de `authenticated`/`anon` em `enrollments`;
- o aluno consulta `student_enrollments` (sem a coluna);
- o professor consulta `teacher_enrollments`, uma view `security definer` restrita por `teacher_id = auth.uid()`;
- consultas diretas do aluno a `private_notes` falham com *permission denied*;
- os serviços do portal também removem a coluna das respostas.

Os testes de RLS verificam que o aluno não lê notas privadas, que o professor lê apenas as dos próprios vínculos e que a visão de professor retorna zero linhas para o aluno. A integração viva com o Supabase Storage não é executada (a migração do bucket é entregue separadamente).

## 7. Testes de propriedade, integração e cobertura

**Spec:** 39 + 33 + 76 + 59 + 54 + 60 propriedades, testes de integração/RLS e cobertura ≥80%.

**Implementado:**
- **270 testes automatizados**, todos passando, organizados por módulo e por suíte opcional (`auth-optional`, `enrollment-optional`, `plan-optional`, `library-optional`, `lessons-optional`, `portal-optional`, `rls`);
- testes de propriedades com **fast-check** (geração de contas, convites, busca, filtros, transições, datas, valores de agenda, paginação etc.);
- testes de integração cobrindo signup/login, convite, recuperação de senha, avatar, ciclo de vínculo, planos, biblioteca/webhook, agenda e portal;
- **RLS executado em PostgreSQL real (PGlite/WASM)**, com 29 cenários de isolamento, escrita negada, notas privadas e visibilidade de planos/biblioteca/aulas;
- **cobertura: 84,58% das instruções e 81,32% dos branches**, acima da meta de 80%;
- todos os itens opcionais (`*`) dos seis `tasks.md` foram marcados como concluídos.

**Não executado:** testes contra uma instância Supabase real (Auth/Storage/realtime), testes E2E em navegador e testes das políticas do bucket de Storage em runtime. A cobertura global inclui arquivos de integração que não são exercitados no modo local (clientes Supabase/Mux/Resend, por exemplo), mas a meta global foi atingida.

## 8. Sessões e redefinição de senha

**Spec:** redefinir senha invalida todas as sessões.

**Implementado:** o cookie é limpo no navegador que conclui a redefinição; como a sessão local é stateless, outras sessões existentes não são revogadas centralmente. Em produção, o Supabase Auth faz a invalidação de sessões.

## 9. Acesso a vídeos de planos publicados

**Spec:** o vídeo é acessível por técnica liberada ou associação a aula; o plano é uma relação separada.

**Decisão:** um vídeo sugerido por um dia de plano **publicado e liberado ao aluno** também autoriza a reprodução. Isso evita que o aluno veja a recomendação no plano e receba 403 ao tentar assistir. A autorização continua validada no servidor e restrita a planos publicados + vínculo ativo.

## 10. Extensões e endpoints extras

- Campo `bio` em `teachers` (não previsto no schema original; usado no perfil público).
- `POST /api/auth/switch-role` para alternar visão quando a conta tem ambos os papéis.
- `POST /api/library/videos/[id]/status` para simular processamento no demo.
- `GET /api/dev/outbox` para inspecionar e-mails locais.
- `GET /api/dashboard` para o dashboard do professor.
- Hooks e clientes de API (`hooks/*`, `lib/api/*`) adicionados como camada reutilizável; as páginas atuais chamam as rotas diretamente em vários fluxos.

## 11. Confirmação de e-mail

**Spec:** confirmação de e-mail configurável.

**Implementado:** o modelo guarda `email_confirmed_at`, mas o modo local não envia confirmação nem bloqueia acesso. Em produção, isso deve ser habilitado no Supabase Auth.

## 12. Tempo real

**Spec:** atualização do portal em até 5 segundos via realtime.

**Implementado:** as consultas sempre leem o estado atual do repositório e as páginas são `force-dynamic`; a atualização ocorre em recarregamentos/refreshes após mutações (`router.refresh()`). Não há assinatura realtime no modo local.

## 13. Datas e fuso horário

- Timestamps são persistidos em UTC (ISO 8601).
- A interface formata no fuso do navegador; a demonstração usa `America/Sao_Paulo` como padrão do professor.
- Slots recorrentes usam horário local (`TIME`) e a geração aplica a data local do servidor.

## 14. Limitações de escopo intencionais

Permanecem fora do MVP, conforme o planejamento original: pagamentos, chat, marketplace, apps nativos, videoconferência, IA de planejamento, gamificação, gestão de academias, integrações de calendário e avaliações/provas.

## 15. Google Social Authentication

> **Atualização:** o login/cadastro/conexão Google agora usa o **provider Google
> do Supabase Auth** (`signInWithOAuth`), com os tokens do provider persistidos
> no Supabase para o Drive. O texto abaixo descreve o MVP local original e fica
> como registro histórico. Veja `docs/google-social-authentication.md`.

**Spec:** `.kiro/specs/google-social-authentication` (OAuth direto no backend, tokens criptografados, refresh, desconexão, rate limiting e testes de propriedade).

**Implementado:**
- endpoints `POST/GET /api/auth/google/authorize`, `GET /api/auth/google/callback`,
  `POST /api/auth/google/disconnect` e `POST /api/auth/google/token/refresh`;
- serviços de criptografia AES-256-GCM/PBKDF2, state + PKCE S256, cliente Google,
  regras de login/cadastro/connect, refresh lazy, desconexão e auditoria;
- componentes `GoogleAuthButton`, `GoogleAccountStatus`, `GoogleDisconnectDialog`,
  `GoogleErrorAlert` e a seção de configurações usada nas páginas de professor e aluno;
- migração `20261103_000003_google_oauth.sql` com tabela de tokens, auditoria,
  codes usados e políticas RLS;
- 80 novos cenários (unitários, componentes, 12 propriedades e integração) e
  6 novos cenários de RLS, totalizando 356 testes.

**Decisões/diferenças:**
- **SameSite=Lax** no cookie de state (o design citava `Strict`). O retorno do
  Google é uma navegação top-level cross-site; `Strict` impediria o callback. A
  proteção CSRF continua sendo o `state` de uso único com validade de 10 minutos.
- `token_iv` guarda dois IVs (`<access>:<refresh>`) porque access e refresh são
  criptografados separadamente. Reutilizar um único IV no AES-GCM seria inseguro.
- O rate limit é em memória por instância. Em produção serverless multi-instância,
  deve ser substituído por Redis/Upstash; a interface de `lib/middleware/rate-limit.ts`
  permanece a mesma.
- O Google real não está configurado no ambiente de execução. Os testes usam
  `fetch` mockado e validam o fluxo completo; sem credenciais, a API responde
  `503 configuration_error` e o login por e-mail continua funcionando.
- O fluxo usa OAuth direto no backend (como em `design.md`/`tasks.md`) em vez de
  `supabase.auth.signInWithOAuth`, porque o runtime local não usa Supabase Auth.
  Em produção, o provider Google do Supabase pode substituir ou complementar
  esta camada; a tabela `user_google_oauth` continua sendo a fonte dos tokens
  para o Google Drive.
- O endpoint de revogação usado é `https://oauth2.googleapis.com/revoke` (o
  endpoint real do Google), e não `oauth.googleapis.com/revoke` como constava
  em `requirements.md`.
- Assim como as demais features, o runtime local usa o repositório JSON; o schema
  PostgreSQL/RLS equivalente é entregue na migração para produção.
- As etapas 9.1–9.4 (criar credenciais Google Cloud de teste, deploy em staging e
  configuração de produção) dependem de infraestrutura externa e estão
  documentadas como checklist em `docs/google-social-authentication.md`; não
  foram executadas neste ambiente.

## 16. Google Drive Video Storage

**Spec:** `.kiro/specs/google-drive-video-storage` (armazenamento de vídeos no
Drive, permissões nativas, modo híbrido, migração e tratamento de erros).

**Implementado:**
- migração `20261103_000004_google_drive_video_storage.sql` com
  `providers_oauth_tokens`, `video_storage_config`, `drive_folder_mappings`,
  `video_access_audit`, `video_upload_sessions`, `video_migration_jobs` e
  extensão de `videos` (`drive_file_url`, `metadata_synced_at`, `size_bytes`,
  `owner_id`, `visibility`, `mux_id`, timestamps de arquivamento/exclusão);
- cliente Google Drive API v3 com timeout, retry exponencial, leitura de
  `Retry-After` e circuit breaker (5 falhas → pausa de 5min);
- serviço de pastas idempotente, upload multipart e em chunks, reprodução
  assinada, compartilhamento, movimentação, arquivamento, exclusão e cache;
- endpoints `/api/google-drive/*` e `/api/videos/*`;
- UI de conexão/status do Drive, upload com progresso, player híbrido
  (iframe Drive / vídeo Mux), histórico de acessos e vídeos pessoais;
- migração Mux → Drive via job em processo e endpoint de progresso;
- 82 novos cenários (cliente, serviço, endpoints, 19 propriedades, componentes,
  performance e 7 de RLS), totalizando 438 testes.

**Decisões/diferenças:**
- **URLs de reprodução:** a URL entregue aponta para
  `/api/google-drive/embed/:token`, um token HMAC de 1h, que redireciona para o
  preview do Drive. Assim a expiração é aplicada pelo servidor e nenhuma URL é
  persistida (Propriedade 16). O design citava cache de 30s; optamos por não
  cachear URLs por segurança.
- **Upload:** o navegador usa a sessão resumable nativa do Google Drive em
  chunks de 8 MiB (`Content-Range`); o corpo não passa pela Vercel, eliminando o
  limite de 4,5 MB. O servidor apenas cria a sessão, valida o arquivo e grava os
  metadados no Supabase.
- **WebSocket:** o progresso é exposto por polling HTTP no componente de upload;
  WebSocket ficou como opcional não necessário no MVP.
- **Migração Mux → Drive:** execução sob demanda em lotes (`POST
  /api/videos/migrate/:jobId`), sem `queueMicrotask`. Pode ser automatizada por
  Cron Job ou fila externa (Bull/Redis).
- **Permissões:** além do compartilhamento nativo do Drive, a aplicação mantém a
  ACL existente de técnica/aula/plano antes de consultar o Drive, como defesa em
  profundidade (o design permite verificar RLS + Drive).
- **Consentimento único:** login social e Drive compartilham o mesmo OAuth. Os
  tokens são espelhados entre `user_google_oauth` e `providers_oauth_tokens`;
  usuários antigos são adotados automaticamente, sem novo consentimento. A UI
  tem apenas um botão “Conectar conta Google” e o card do Drive é informativo.
  Os endpoints `/api/google-drive/oauth/*` permanecem como compatibilidade.
- **Vídeos pessoais:** no runtime local os campos legados `teacher_id`,
  `module_id` e `technique_id` recebem o id do aluno/strings vazias para manter
  compatibilidade com o repositório JSON; a migração PostgreSQL permite `NULL`
  nesses campos e usa `owner_id`/`visibility`.
- **Deploy:** 11.14 e 11.15 (staging/produção) dependem de infraestrutura externa
  e estão documentados como checklist em
  `docs/google-drive-video-storage.md`; não foram executados.
