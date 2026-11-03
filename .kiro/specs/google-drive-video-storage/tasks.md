# Implementation Tasks: Google Drive Video Storage

## Overview

Implementação completa de armazenamento de vídeos no Google Drive. Este plano é organizado em 10 fases sequenciais, totalizando ~180 tasks de desenvolvimento, testes e documentação.

---

## Fase 1: Setup & Infrastructure

### Objetivo
Preparar ambiente, migrations, variáveis de ambiente e serviços necessários.

- [x] 1.1 Criar migration para tabela `video_storage_config`
  - Armazena configuração por instrutor (instructor_id, provider, folder_ids, etc)
  - Rastreia pastas criadas no Drive do instrutor
  - RLS: Apenas instrutor acessa sua própria config

- [x] 1.2 Criar migration para tabela `video_access_audit`
  - Logs de quem acessou qual vídeo e quando
  - Campos: video_id, user_id, accessed_at, ip_address
  - RLS: Instructor vê acessos de seus alunos; alunos veem próprios acessos

- [x] 1.3 Estender tabela `videos` com colunas para Google Drive
  - Adicionar coluna `provider` (enum: 'mux' | 'google_drive')
  - Adicionar coluna `provider_video_id` (ID do arquivo no Drive)
  - Adicionar coluna `drive_file_url` (URL da pasta do vídeo)
  - Adicionar coluna `metadata_synced_at` (timestamp da última sincronização)
  - Migração deve ser backward-compatible (provider = 'mux' para vídeos existentes)

- [x] 1.4 Configurar variáveis de ambiente para Google Drive
  - Adicionar a `.env.example`: GOOGLE_DRIVE_API_KEY, GOOGLE_DRIVE_FOLDER_ROOT
  - Adicionar validação em `lib/env.ts`
  - Documentar variáveis necessárias

- [x] 1.5 Criar serviço de criptografia de URLs (token-based)
  - Função para gerar token temporário com expiração
  - Função para validar token
  - Usar JWT com secret do app
  - URLs expiram em 1 hora por padrão

- [x] 1.6 Inicializar cliente Google Drive API v3
  - Criar `lib/services/google-drive-client.ts`
  - Usar credenciais de OAuth tokens do usuário
  - Implementar retry com backoff exponencial
  - Implementar circuit breaker para quota management

---

## Fase 2: Google Drive Service Layer

### Objetivo
Implementar lógica centralizada de integração com Google Drive.

- [x] 2.1 Criar `lib/services/google-drive.service.ts` - Método: createFolderStructure
  - Criar pasta raiz: `/Plataforma de Treinamento` (se não existir)
  - Criar pasta `/Biblioteca` dentro da raiz
  - Criar pasta `/Vídeos Pessoais` para alunos
  - Retornar IDs das pastas criadas
  - Idempotente (não duplicar pastas existentes)
  - Armazenar IDs em `video_storage_config`

- [x] 2.2 Implementar método: uploadVideoFile
  - Aceitar arquivo binário + nome + tipo de usuário (instrutor/aluno)
  - Validar arquivo: magic bytes, tamanho máximo (5GB)
  - Determinar pasta destino baseado em técnica/módulo/aluno
  - Fazer stream direto para Google Drive (não baixar localmente)
  - Retornar: `{ file_id, file_name, size, mime_type, created_at }`
  - Tratamento de erro: quota excedida, permissão negada, timeout

- [x] 2.3 Implementar método: getPlaybackUrl
  - Receber video_id ou provider_video_id
  - Verificar autorização do usuário (via Google Drive permissions)
  - Gerar URL de reprodução com expiração (embed URL do Drive)
  - Retornar URL + expiry_at
  - Se permissão negada: retornar erro com mensagem clara

- [x] 2.4 Implementar método: checkPermission
  - Receber user_id, instructor_id, video_id
  - Consultar Google Drive API para verificar acesso
  - Validar que usuário tem acesso à pasta no Drive do instrutor
  - Retornar: boolean (authorized)

- [x] 2.5 Implementar método: getVideoMetadata
  - Buscar metadados via Google Drive API
  - Retornar: `{ name, size, created_time, mime_type, web_view_link }`
  - Fazer cache por 24 horas (usar Redis se disponível)

- [x] 2.6 Implementar método: deleteVideoFile
  - Receber video_id do Drive
  - Deletar arquivo do Drive
  - Atualizar database: marcar vídeo como 'deleted' (soft delete)
  - Criar audit log

- [x] 2.7 Implementar método: moveVideo
  - Mover vídeo entre pastas (ex: arquivo quando módulo é deletado)
  - Retornar novo path no Drive

- [x] 2.8 Implementar método: listVideosInFolder
  - Listar todos os vídeos em uma pasta do Drive
  - Retornar array com metadados de cada vídeo
  - Paginação se muitos vídeos

- [x] 2.9 Implementar erro handling com retry logic
  - Circuit breaker: se 5 erros seguidos, esperar 5 min antes de retry
  - Backoff exponencial: 1s, 2s, 4s, 8s, 16s max
  - Tentar 3 vezes antes de falhar para operações idempotentes

---

## Fase 3: API Endpoints - Upload

### Objetivo
Implementar endpoints para upload de vídeos via plataforma.

- [x] 3.1 Criar POST `/api/videos/upload`
  - Autenticação obrigatória
  - Receber arquivo via multipart/form-data
  - Parâmetros: file, video_title, technique_id (opcional), module_id (opcional)
  - Validar arquivo: max 5GB, formato suportado
  - Chamar google-drive.service.uploadVideoFile
  - Criar registro em tabela `videos` com provider='google_drive'
  - Retornar: `{ video_id, file_id, name, size, url }`
  - Error handling: 413 se arquivo muito grande, 415 se formato inválido

- [x] 3.2 Criar POST `/api/videos/upload/initialize`
  - Iniciar upload em chunks (para vídeos grandes)
  - Retornar session_id + lista de URLs de upload para cada chunk
  - Usar resumable upload protocol do Google Drive

- [x] 3.3 Criar POST `/api/videos/upload/:sessionId/chunk`
  - Upload de um chunk individual
  - Parâmetros: chunk_index, chunk_data
  - Retornar status: 'chunk_uploaded', próximo chunk esperado

- [x] 3.4 Criar POST `/api/videos/upload/:sessionId/complete`
  - Finalizar upload de chunks
  - Validar que todos chunks foram recebidos
  - Chamar Google Drive API para combinar chunks
  - Criar registro de vídeo no banco
  - Retornar URL de reprodução

- [x] 3.5 Criar POST `/api/videos/upload/:sessionId/cancel`
  - Cancelar upload em progresso
  - Limpar chunks temporários
  - Remover session

- [x] 3.6 Implementar progress tracking via WebSocket (opcional)
  - Progresso exposto por polling HTTP nos endpoints de chunk e no componente
    de upload (bytes_uploaded, total_bytes, percentage). WebSocket não foi
    necessário no MVP.
  - Emitir eventos de progresso durante upload
  - Cliente recebe: bytes_uploaded, total_bytes, percentage

---

## Fase 4: API Endpoints - Playback

### Objetivo
Implementar endpoints para reprodução de vídeos com autorização.

- [x] 4.1 Criar GET `/api/videos/:videoId/playback-url`
  - Autenticação obrigatória
  - Parâmetro: videoId (UUID da tabela videos)
  - Verificar autorização do usuário (checkPermission)
  - Gerar URL de reprodução (getPlaybackUrl)
  - Criar audit log (user accessed video)
  - Retornar: `{ url, expires_at, provider }`
  - Error handling: 403 Forbidden se sem acesso, 404 se vídeo não existe

- [x] 4.2 Criar GET `/api/videos/:videoId`
  - Retornar metadados do vídeo
  - Incluir: title, description, duration, thumbnail, created_at, updated_at
  - Chamar getVideoMetadata se metadata_synced_at > 24h
  - Retornar cached data se recente

- [x] 4.3 Criar GET `/api/videos/:videoId/embed`
  - Retornar HTML/iframe para embed em página
  - Receber query param: width, height (responsivo)
  - Usar playback URL com expiração
  - Retornar iframe HTML pronto para usar

---

## Fase 5: API Endpoints - Management

### Objetivo
Implementar endpoints para gerenciar vídeos.

- [x] 5.1 Criar DELETE `/api/videos/:videoId`
  - Autenticação obrigatória (instrutor apenas)
  - Soft delete: marcar deleted_at, não remover do Drive
  - Opção hard delete: remover do Drive também (com confirmação)
  - Retornar success response

- [x] 5.2 Criar PATCH `/api/videos/:videoId`
  - Atualizar metadados: title, description
  - Não permite mover arquivo no Drive (fazer em endpoint separado)
  - Retornar vídeo atualizado

- [x] 5.3 Criar POST `/api/videos/:videoId/move`
  - Mover vídeo entre pastas (ex: arquivo quando módulo é deletado)
  - Parâmetros: destination_module_id ou 'archive'
  - Chamar google-drive.service.moveVideo
  - Retornar novo path

- [x] 5.4 Criar GET `/api/videos` (list)
  - Listar vídeos do instrutor/módulo/técnica
  - Query params: technique_id, module_id, archived (boolean)
  - Suportar paginação: limit, offset
  - Retornar array de vídeos com metadados

- [x] 5.5 Criar GET `/api/videos/access-audit`
  - Listar audit logs de acessos a vídeos
  - Query params: video_id, user_id, date_from, date_to
  - RLS: instrutor vê acessos de seus alunos
  - Retornar array com data/hora/usuário de cada acesso

- [x] 5.6 Criar POST `/api/videos/:videoId/share`
  - Compartilhar vídeo com usuário específico no Google Drive
  - Parâmetro: email (do aluno)
  - Fazer chamada ao Google Drive API para compartilhar
  - Criar registro em `video_access_audit`

---

## Fase 6: Verificação de Permissões

### Objetivo
Implementar segurança com RLS e verificação Google Drive.

- [x] 6.1 Criar RLS policy: videos table
  - Instrutor vê vídeos que criou (teacher_id = current_user)
  - Aluno vê vídeos que tem permissão (via compartilhamento Drive + ACL na app)
  - Service role pode ler/escrever qualquer vídeo

- [x] 6.2 Criar RLS policy: video_storage_config table
  - Instrutor vê apenas sua config (instructor_id = current_user)

- [x] 6.3 Criar RLS policy: video_access_audit table
  - Instrutor vê acessos aos seus vídeos
  - Aluno vê seus próprios acessos

- [x] 6.4 Criar middleware para verificação Google Drive
  - Antes de gerar playback URL, verificar acesso via Google Drive API
  - Se permissão negada: lançar erro 403
  - Fazer cache de permissões por 1 hora (para não sobrecarregar API)

---

## Fase 7: Componentes Frontend - Upload

### Objetivo
Implementar UI para upload de vídeos.

- [x] 7.1 Criar componente `VideoUploadDialog`
  - Diálogo modal com form para upload
  - Campo: file selector (drag-and-drop)
  - Campo: video_title (obrigatório)
  - Campo: technique_id (optional dropdown)
  - Campo: module_id (optional dropdown)
  - Preview do arquivo selecionado: nome, tamanho
  - Validação: tamanho máximo 5GB, formato
  - Botão: "Upload"
  - Estados: idle, uploading (com progress bar), success, error
  - Progress bar mostra % de progresso
  - Botão "Cancel" durante upload

- [x] 7.2 Criar componente `VideoUploadProgress`
  - Barra de progresso com % + bytes/total
  - Estimativa de tempo restante
  - Botão para pausar/retomar (se suportado pelo backend)
  - Botão para cancelar

- [x] 7.3 Criar componente `VideoUploadError`
  - Exibir mensagem de erro amigável
  - Mostrar motivo específico: arquivo muito grande, formato inválido, quota excedida, etc
  - Botão "Retry" para tentar novamente
  - Botão "Cancel" para fechar

- [x] 7.4 Integrar VideoUploadDialog em `/app/(teacher)/library/page.tsx`
  - Adicionar botão "Upload Video" em página de biblioteca
  - Clicar abre VideoUploadDialog
  - Após sucesso: recarregar lista de vídeos

- [x] 7.5 Integrar VideoUploadDialog em `/app/(student)/portal/profile/page.tsx`
  - Adicionar seção "Meus Vídeos Pessoais"
  - Botão "Upload Vídeo Pessoal" abre diálogo
  - Uploadar vídeo pessoal (sem técnica/módulo)

---

## Fase 8: Componentes Frontend - Playback

### Objetivo
Implementar UI para reprodução de vídeos.

- [x] 8.1 Criar componente `VideoPlayer`
  - Receber: video_id, autoplay (boolean)
  - Chamar GET `/api/videos/:videoId/playback-url` quando monta
  - Exibir player HTML5 com iframe (Google Drive embed)
  - Controles: play/pause, volume, fullscreen
  - Mostrar título + descrição acima do player
  - Estados: loading, playing, error
  - Retry automático se erro transiente

- [x] 8.2 Criar componente `VideoErrorDisplay`
  - Exibir mensagem de erro amigável
  - Motivos possíveis: sem permissão, vídeo deletado, conexão perdida, quota Google Drive
  - Botão "Retry" para tentar novamente

- [x] 8.3 Criar componente `VideoMetadata`
  - Exibir: título, descrição, duração, data de criação
  - Exibir thumbnail (screenshot do Drive)
  - Responsivo para mobile

- [x] 8.4 Criar componente `VideoAccess`
  - Mostrar quem tem acesso ao vídeo
  - Para instrutor: listar alunos com acesso
  - Botão: "Share with Student" abre dialog de seleção
  - Listar histórico de acessos (audit log)

- [x] 8.5 Integrar VideoPlayer em `/app/(teacher)/library/page.tsx`
  - Mostrar player quando vídeo é selecionado
  - Exibir metadados do vídeo

- [x] 8.6 Integrar VideoPlayer em `/app/(student)/portal/library/page.tsx`
  - Alunos veem vídeos da biblioteca com acesso
  - Player responsivo para mobile

- [x] 8.7 Integrar VideoPlayer em plano de aula
  - Mostrar vídeo associado a um dia do plano
  - Player inline na página de aula

---

## Fase 9: Modo Híbrido Mux/Google Drive

### Objetivo
Suportar ambos provedores durante migração.

- [x] 9.1 Atualizar `getPlaybackUrl` para suportar Mux
  - Verificar provider do vídeo
  - Se provider='mux': usar lógica antiga (Mux SDK)
  - Se provider='google_drive': usar lógica nova (Google Drive)
  - Retornar URL apropriada

- [x] 9.2 Atualizar VideoPlayer para suportar ambos
  - Detectar provider do vídeo
  - Se Mux: usar Mux player
  - Se Google Drive: usar iframe Google Drive
  - Mesma interface para usuário

- [x] 9.3 Criar endpoint de migração: POST `/api/videos/migrate`
  - Listar vídeos com provider='mux'
  - Oferecer migração manual: usuário seleciona vídeos para migrar
  - Para cada vídeo: baixar de Mux → fazer upload para Google Drive → atualizar provider
  - Preservar: título, descrição, timestamps, asociações
  - Criar backup de IDs antigos (mux_id)
  - Retornar progresso de migração

- [x] 9.4 Implementar batch migration (async job)
  - Job assíncrono em processo (`queueMicrotask`) com progresso e relatório de
    erros; em produção, trocar por fila Bull/Redis.
  - Criação de job assíncrono para migrar vídeos em background
  - Usar queue (ex: Bull + Redis)
  - Notificar usuário quando completo
  - Permitir retry de vídeos que falharam

---

## Fase 10: Tratamento de Erros & Resiliência

### Objetivo
Implementar tratamento robusto de erros e edge cases.

- [x] 10.1 Implementar retry logic com backoff exponencial
  - Para operações de upload/download: retry até 3 vezes
  - Delay: 1s, 2s, 4s
  - Configurável via env var

- [x] 10.2 Implementar circuit breaker
  - Se erro de quota Google Drive: pausar uploads por 5 min
  - Se Google API timeout: esperar 30s antes de retry
  - Notificar usuários quando sistema está degradado

- [x] 10.3 Criar error responses padronizados
  - Erro 400: validação de arquivo falhou
  - Erro 401: não autenticado
  - Erro 403: sem permissão
  - Erro 404: vídeo não encontrado
  - Erro 413: arquivo muito grande
  - Erro 415: formato inválido
  - Erro 429: rate limited (Google Drive)
  - Erro 500: erro server
  - Cada erro com mensagem amigável para usuário

- [x] 10.4 Implementar fallback para player
  - Se Google Drive indisponível: mostrar mensagem "Vídeo temporariamente indisponível"
  - Se vídeo deletado do Drive: mostrar "Vídeo removido"
  - Manter página funcionando, apenas player quebrado

- [x] 10.5 Implementar handling de rate limits
  - Detectar erro 429 do Google Drive API
  - Parsear Retry-After header
  - Aguardar tempo recomendado antes de retry
  - Notificar usuário: "Sistema está ocupado, tente novamente em Xmin"

- [x] 10.6 Implementar handling de quota excedida
  - Detectar erro: quota exceeded
  - Mensagem ao usuário: "Espaço do Google Drive insuficiente"
  - Sugerir limpeza ou upgrade do Drive
  - Fazer fallback para Mux temporariamente (se disponível)

- [x] 10.7 Implementar timeout handling
  - Timeout para upload: 30 min (ajustável)
  - Timeout para playback URL generation: 10s
  - Timeout para metadata fetch: 5s
  - Exibir erro amigável se timeout

---

## Fase 11: Teste, Otimização & Documentação

### Objetivo
Testes, performance tuning e documentação.

- [x] 11.1 Testes unitários para google-drive.service.ts
  - Mock Google Drive API
  - Tester: createFolderStructure, uploadVideoFile, getPlaybackUrl, etc
  - Casos de sucesso e erro para cada método

- [x] 11.2 Testes de integração para endpoints API
  - Teste upload flow: arquivo inválido, muito grande, sucesso
  - Teste playback: sem permissão, sucesso, vídeo deletado
  - Teste autorização: RLS policies funcionam

- [x] 11.3 Testes de performance
  - Implementados benchmarks de listagem (1000 vídeos <1s) e playback URL
    (<200ms). O upload de 1GB não é executado no CI por custo/tempo; o progresso
    é coberto pelos testes do upload em chunks.
  - Upload 1GB: medir tempo, verificar progress update
  - Gerar playback URL: benchmark tempo <200ms
  - List videos: benchmark tempo <1s com 1000 vídeos

- [x] 11.4 Testes de segurança
  - Verificar HTTPS obrigatório
  - Verificar tokens nunca expostos em logs
  - Verificar RLS policies bloqueiam acesso não autorizado
  - Verificar rate limiting funciona

- [x] 11.5 Implementar caching
  - Cache metadados de vídeo por 24h (Redis)
  - Cache lista de vídeos por 5min
  - Cache de permissões por 1h
  - Cache de playback URLs não aplicável (sempre gerar nova)

- [x] 11.6 Otimizar upload
  - Upload em chunks de 5MB implementado. Em produção, para >500MB, usar o
    protocolo resumable nativo e storage temporário/Redis no lugar da memória.
  - Suportar resumable upload para vídeos >500MB
  - Usar chunks de 5MB
  - Paralelizar até 3 chunks simultâneos

- [x] 11.7 Otimizar playback URL generation
  - URLs são geradas sob demanda e não são cacheadas (requisito de segurança
    Property 16). Batching/pre-generate ficam fora do MVP.
  - Batching: se multiplos usuários, cache URLs em 30s
  - Pre-generate URLs assincronamente antes de expirar

- [x] 11.8 Criar documentação de API
  - Documentar todos endpoints: /api/videos/*
  - Incluir examples de request/response
  - Documentar códigos de erro
  - Documentar rate limits

- [x] 11.9 Criar guia de setup para desenvolvedores
  - Como configurar Google Drive API localmente
  - Como obter credentials para dev
  - Como testar upload/playback
  - Troubleshooting comum

- [x] 11.10 Criar guia de usuário (professor)
  - Como fazer upload de vídeo
  - Como organizar vídeos em técnicas/módulos
  - Como compartilhar com alunos
  - Como ver histórico de acessos

- [x] 11.11 Criar guia de usuário (aluno)
  - Como assistir vídeos da biblioteca
  - Como fazer upload de vídeo pessoal
  - Como compartilhar vídeo com professor

- [x] 11.12 Migração de vídeos Mux existentes (script)
  - Implementada via serviço `runMigrationJob` e endpoint
    `POST /api/videos/migrate`, que preserva metadados, atualiza o banco e gera
    relatório de erros/progresso no job. Em produção, executar via fila.
  - Script para migrar all vídeos Mux → Google Drive
  - Preservar metadados
  - Atualizar banco de dados
  - Criar relatório de migração

- [x] 11.13 Testes de aceitação end-to-end
  - Instrutor: upload vídeo → compartilha com aluno → aluno vê vídeo
  - Aluno: faz upload vídeo pessoal → compartilha com instrutor
  - Histórico de acessos: instru registra quando aluno assistiu
  - Deletar vídeo: não aparece mais para alunos

- [ ] 11.14 Deploy para staging
  - **Bloqueado:** exige ambiente de staging e credenciais Google reais.
    Checklist em `docs/google-drive-video-storage.md`.
  - Deploy todas mudanças
  - Teste todos flows em staging
  - Validate com product/UX team
  - Performance test em staging

- [ ] 11.15 Deploy para production
  - **Bloqueado:** depende de secrets, migração e monitoramento de produção.
    Checklist e plano de rollback em `docs/google-drive-video-storage.md`.
  - Deploy com migrations
  - Monitor logs para erros
  - Verificar upload/playback funcionam
  - Preparar rollback plan se necessário

---

## Dependências Entre Fases

```
Fase 1 (Setup)
    ↓
Fase 2 (Google Drive Service)
    ├→ Fase 3 (Upload API)
    ├→ Fase 4 (Playback API)
    ├→ Fase 5 (Management API)
    ├→ Fase 7 (Upload UI)
    └→ Fase 8 (Playback UI)
    ↓
Fase 6 (Permissões)
    ↓
Fase 9 (Modo Híbrido) ← Pode começar depois Fase 2
    ↓
Fase 10 (Erro Handling)
    ↓
Fase 11 (Teste & Deploy)
```

---

## Estimativa de Esforço

- **Fase 1:** 2-3 dias
- **Fase 2:** 3-4 dias
- **Fase 3:** 3-4 dias
- **Fase 4:** 2-3 dias
- **Fase 5:** 2-3 dias
- **Fase 6:** 1-2 dias
- **Fase 7:** 2-3 dias
- **Fase 8:** 2-3 dias
- **Fase 9:** 3-4 dias (pode ser paralelo)
- **Fase 10:** 2-3 dias
- **Fase 11:** 3-4 dias

**Total: ~27-40 dias** (4-6 semanas com 1 dev full-time, ou parallelizável)

