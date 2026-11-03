# Design: Armazenamento de Vídeos no Google Drive

## Overview

Esta feature implementa integração com Google Drive como provedor de armazenamento de vídeos, substituindo gradualmente o Mux. O sistema autentica instrutores e alunos via OAuth 2.0, permitindo uploads diretos para seus Drives e gerando URLs de reprodução sob demanda.

**Objetivos Principais:**
- Autenticação OAuth para instrutor (Drive de biblioteca) e aluno (Drive pessoal)
- Upload de vídeos com organização automática em pastas
- Geração de URLs de reprodução com expiração (nunca armazenadas)
- Permissões gerenciadas via compartilhamento nativo do Google Drive (sem ACL própria)
- Modo híbrido com Mux durante migração
- Tratamento de erros robusto com rate limiting

---

## Architecture

### Fluxo de Alto Nível

```
┌─────────────────────────────────────────────────────────────┐
│                     Usuário (Instrutor/Aluno)               │
└─────────────────┬───────────────────────────────────────────┘
                  │
         ┌────────▼────────────┐
         │  Next.js Frontend   │
         │  (Client Component) │
         └────────┬────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
    ▼             ▼             ▼
┌────────────┐ ┌────────┐ ┌──────────┐
│OAuth Flow  │ │Upload  │ │Playback  │
│Endpoint    │ │Handler │ │Handler   │
└────────────┘ └────────┘ └──────────┘
    │             │             │
    └─────────────┼─────────────┘
                  │
         ┌────────▼────────────────┐
         │  google-drive.service   │
         │  (Business Logic)       │
         └────────┬────────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
    ▼             ▼             ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────┐
│Google Drive  │ │Supabase DB  │ │Token Manager │
│API v3        │ │(metadata)   │ │(encryption)  │
└──────────────┘ └─────────────┘ └──────────────┘
```

### Componentes Principais

#### 1. **google-drive.service.ts** - Serviço Central de Integração
Responsável por toda lógica de comunicação com Google Drive API:
- Autenticação e renovação de tokens
- Upload de arquivos
- Geração de URLs de reprodução
- Criação/gerenciamento de estrutura de pastas
- Verificação de permissões

#### 2. **OAuth Flow Handler** - Autenticação
- Redireciona usuário para Google OAuth
- Callback recebe authorization code
- Troca code por access token + refresh token
- Armazena tokens criptografados em Supabase
- Gerencia refresh automático de tokens expirados

#### 3. **Token Manager** - Segurança de Tokens
- Criptografia/descriptografia de tokens (pgcrypto do PostgreSQL)
- Verificação de expiração
- Refresh automático antes de uso
- Logging de acessos para auditoria

#### 4. **Upload Handler** - Recepção de Vídeos
- Validação de arquivo (magic bytes, tamanho)
- Streaming direto para Google Drive
- Criação de registro em banco de dados
- Extração de metadados (duração, tamanho)
- Retry com backoff exponencial

#### 5. **Playback Handler** - Reprodução
- Verifica autorização (RLS + Google Drive permissions)
- Gera URL sob demanda com expiração
- Retorna URL para player (iframe ou HTML5)
- Fallback para Mux se vídeo for legado

---

## Components and Interfaces

### Data Models

#### Tabela: `providers_oauth_tokens`
Armazena tokens OAuth criptografados para instrutor e aluno:

```typescript
interface OAuthToken {
  id: string; // UUID
  user_id: string; // FK para auth.users
  provider: 'google_drive'; // Identificador do provedor
  access_token: string; // Encrypted
  refresh_token: string; // Encrypted
  expires_at: timestamp; // Expiração do access token
  scope: string; // Escopos aprovados ("drive.file")
  drive_id: string; // Identificador único do Drive do usuário
  created_at: timestamp;
  updated_at: timestamp;
}
```

#### Extensão: Tabela `videos` (Existente)
Campo já existe para suportar múltiplos provedores:

```typescript
interface Video {
  id: string; // UUID
  provider: 'google_drive' | 'mux'; // Qual provedor armazena o vídeo
  provider_video_id: string; // ID no Google Drive ou Mux
  title: string;
  description: string;
  duration_seconds: number; // Extraído de metadados do Drive
  size_bytes: number;
  thumbnail_url: string; // URL temporária ou placeholder
  created_at: timestamp;
  updated_at: timestamp;
  // ... outros campos existentes
}
```

#### Tabela: `drive_folder_mappings` (Nova)
Mapeia estrutura de pastas do Drive para referência posterior:

```typescript
interface DriveFolderMapping {
  id: string; // UUID
  user_id: string; // FK para auth.users (instrutor ou aluno)
  folder_type: 'root' | 'library' | 'technique' | 'module' | 'personal'; 
  folder_name: string;
  google_drive_folder_id: string; // ID único da pasta no Drive
  parent_folder_id?: string; // FK para pasta pai
  created_at: timestamp;
}
```

#### Tabela: `video_access_audit` (Nova)
Auditoria de acessos a vídeos para compliance:

```typescript
interface VideoAccessAudit {
  id: string; // UUID
  video_id: string; // FK para videos
  user_id: string; // FK para auth.users (quem acessou)
  accessed_at: timestamp;
  ip_address: string;
  user_agent: string;
}
```

### Service: google-drive.service.ts

```typescript
class GoogleDriveService {
  // Autenticação
  async getOAuthAuthorizationUrl(userId: string): Promise<string>
  async handleOAuthCallback(userId: string, code: string): Promise<void>
  async refreshTokenIfNeeded(userId: string): Promise<void>
  
  // Estrutura de Pastas
  async ensureLibraryStructure(userId: string): Promise<{
    rootFolderId: string
    libraryFolderId: string
  }>
  async createTechniqueFolderIfNeeded(userId: string, techniqueId: string, techniqueName: string): Promise<string>
  async createModuleFolderIfNeeded(userId: string, moduleId: string, moduleName: string, technicFolderId: string): Promise<string>
  
  // Upload
  async uploadVideo(
    userId: string,
    file: File,
    destination: 'library' | 'personal',
    destinationFolderId: string
  ): Promise<{
    googleDriveFileId: string
    durationSeconds: number
    sizeBytes: number
  }>
  
  // Reprodução
  async getPlaybackUrl(videoId: string, userId: string): Promise<string>
  async generateEmbedUrl(googleDriveFileId: string): Promise<string>
  
  // Permissões
  async checkDriveAccess(userId: string): Promise<boolean>
  async verifyFileAccess(userId: string, googleDriveFileId: string): Promise<boolean>
  
  // Metadados
  async extractVideoMetadata(googleDriveFileId: string): Promise<{
    durationSeconds: number
    sizeBytes: number
    thumbnailUrl?: string
  }>
  
  // Rate Limiting & Retry
  private async callGoogleAPI<T>(
    operation: () => Promise<T>,
    maxRetries?: number
  ): Promise<T>
}
```

### API Endpoints

#### 1. **POST /api/google-drive/oauth/authorize**
Inicia fluxo de autorização OAuth:

```typescript
// Request
{ }

// Response (200)
{
  "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

#### 2. **GET /api/google-drive/oauth/callback**
Callback OAuth recebe code, troca por token:

```typescript
// Query Params
?code=4/0Aep...&state=...

// Response (302 Redirect)
→ /google-drive/settings?status=connected
```

#### 3. **POST /api/google-drive/upload**
Upload de vídeo para biblioteca ou pessoal:

```typescript
// Request (multipart/form-data)
{
  file: File,
  destination: 'library' | 'personal',
  destinationFolderId: string,
  title: string,
  description?: string
}

// Response (200)
{
  "videoId": "uuid",
  "googleDriveFileId": "file_id_from_drive",
  "durationSeconds": 1850,
  "sizeBytes": 524288000,
  "status": "uploaded"
}

// Error (409 - Token Expired)
{
  "error": "Token expirado",
  "code": "token_expired",
  "requiresReauth": true
}
```

#### 4. **GET /api/google-drive/playback/:videoId**
Gera URL de reprodução sob demanda:

```typescript
// Response (200)
{
  "playbackUrl": "https://drive.google.com/file/d/.../preview",
  "expiresIn": 3600, // segundos
  "provider": "google_drive"
}

// Error (403 - Acesso Negado)
{
  "error": "Você não tem permissão para acessar este vídeo"
}

// Error (410 - Vídeo Indisponível)
{
  "error": "Vídeo foi removido ou compartilhamento foi revogado"
}
```

#### 5. **GET /api/google-drive/status**
Verifica status de conexão:

```typescript
// Response (200)
{
  "connected": true,
  "userEmail": "user@gmail.com",
  "driveId": "unique_drive_id",
  "lastSync": "2024-10-28T12:00:00Z"
}

// Response (200 - Disconnected)
{
  "connected": false
}
```

#### 6. **DELETE /api/google-drive/disconnect**
Desconecta conta do Google Drive:

```typescript
// Response (200)
{
  "success": true,
  "message": "Desconectado com sucesso"
}
```

#### 7. **POST /api/google-drive/migrate**
[Futuro] Migração em lote de vídeos Mux para Google Drive:

```typescript
// Request
{ }

// Response (202 - Accepted)
{
  "migrationId": "migration_uuid",
  "status": "started",
  "totalVideos": 45,
  "processedVideos": 0
}
```

---

## UI Components

### 1. **GoogleDriveConnectButton**
Botão de conexão com Google Drive para Settings:

```typescript
interface GoogleDriveConnectButtonProps {
  userType: 'instructor' | 'student'; // Determina label e scopes
  onConnected?: () => void;
  onError?: (error: string) => void;
}

// Component mostra:
// - Estado desconectado: "Conectar ao Google Drive"
// - Estado conectado: "Conectado (user@gmail.com)" com botão de desconectar
// - Estado carregando: spinner
// - Erros com toast notification
```

### 2. **VideoUploadDialog**
Diálogo para upload de vídeos com progresso:

```typescript
interface VideoUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  destination: 'library' | 'personal';
  destinationFolderId: string;
  onUploadComplete?: (video: Video) => void;
}

// Componentes internos:
// - FileInput com validação (mp4, mov, webm, avi, mkv, flv, wmv)
// - TextInputs para título e descrição
// - ProgressBar com porcentagem
// - ErrorAlert se falhar
// - SuccessMessage ao completar
```

### 3. **PlaybackUrl**
Componente para exibir vídeo com URL sob demanda:

```typescript
interface VideoPlayerProps {
  videoId: string;
  provider: 'google_drive' | 'mux';
  canAccess: boolean;
}

// Lógica:
// 1. Fetch playback URL ao montar
// 2. Se google_drive: exibe iframe com embed URL
// 3. Se mux: usa player Mux existente
// 4. Se acesso negado: mostra mensagem
// 5. Retry automaticamente se URL expirou
```

### 4. **GoogleDriveStatus**
Card mostrando status de sincronização:

```typescript
interface GoogleDriveStatusProps {
  userType: 'instructor' | 'student';
}

// Mostra:
// - Status de conexão (conectado/desconectado)
// - Email da conta Google
// - Data da última sincronização
// - Espaço disponível no Drive
// - Botão de reconectar se token expirou
```

---

## Data Models & Relationships

### Fluxo de Dados - Upload de Vídeo de Biblioteca

```
1. Instrutor clica "Upload Video" na página de módulo
   ↓
2. VideoUploadDialog abre com destinationFolderId (pasta do módulo)
   ↓
3. Usuário seleciona arquivo e clica "Upload"
   ↓
4. POST /api/google-drive/upload com File + metadados
   ↓
5. API route:
   a. Valida token (refresh se necessário)
   b. Valida arquivo (tamanho, tipo)
   c. Chama google-drive.service.uploadVideo()
   ↓
6. Service:
   a. Obtém access_token do banco (descriptografa)
   b. Streaming do arquivo para Google Drive API
   c. Retorna googleDriveFileId
   d. Extrai metadados (duração, tamanho)
   ↓
7. API route cria registro em `videos` table:
   {
     provider: "google_drive",
     provider_video_id: googleDriveFileId,
     title: user_input_title,
     duration_seconds: extracted_duration,
     size_bytes: extracted_size,
     ... outras associações (module_id, etc)
   }
   ↓
8. Response (200) com videoId e metadados
   ↓
9. UI atualiza biblioteca mostrando novo vídeo
```

### Fluxo de Dados - Reprodução de Vídeo

```
1. Aluno acessa página de técnica/módulo com vídeos
   ↓
2. UI renderiza VideoPlayer com videoId e provider="google_drive"
   ↓
3. VideoPlayer monta e faz GET /api/google-drive/playback/:videoId
   ↓
4. API route:
   a. Verifica autenticação (usuário logado)
   b. Verifica RLS (aluno tem acesso? via enrollments)
   c. Se sim, chama google-drive.service.getPlaybackUrl(videoId, userId)
   ↓
5. Service:
   a. Busca video.provider_video_id e instrutor_id
   b. Busca instrutor token
   c. Valida acesso no Google Drive (verifyFileAccess)
      - Se token expirado: refresh
      - Se arquivo não existe/sem acesso: retorna erro
   d. Gera URL embed com expiration (1 hora)
   ↓
6. Response (200):
   {
     "playbackUrl": "https://drive.google.com/file/d/.../preview",
     "expiresIn": 3600
   }
   ↓
7. UI renders iframe com embed URL
   ↓
8. Auditoria: INSERT em video_access_audit
```

### Fluxo de Dados - OAuth Authorization

```
1. Instrutor clica "Conectar ao Google Drive" em Settings
   ↓
2. GET /api/google-drive/oauth/authorize
   ↓
3. API retorna authorizationUrl gerada com:
   - client_id, redirect_uri, scope="drive.file"
   - state (CSRF token)
   ↓
4. Navegador redireciona para Google OAuth URL
   ↓
5. Usuário faz login no Google (se necessário)
   ↓
6. Google exibe tela de consentimento
   ↓
7. Usuário clica "Permitir"
   ↓
8. Google redireciona para:
   GET /api/google-drive/oauth/callback?code=AUTH_CODE&state=STATE
   ↓
9. API route:
   a. Valida state (CSRF)
   b. Troca code por tokens usando google-oauth2-client
   c. Valida tokens
   d. Extrai drive_id do token claims
   e. Encripta access_token e refresh_token
   f. Insere em providers_oauth_tokens:
      {
        user_id: current_user.id,
        access_token: encrypt(token.access_token),
        refresh_token: encrypt(token.refresh_token),
        expires_at: token.expiry_date,
        drive_id: extracted_drive_id
      }
   g. Chama google-drive.service.ensureLibraryStructure() para criar pastas
   ↓
10. Redireciona para /settings?status=connected
    ↓
11. UI mostra "Conectado (user@gmail.com)"
```

---

## Integration Points

### Com Schema Existente de Vídeos

**Tabela `videos` já possui:**
- `provider` (enum: 'mux', 'google_drive', 'demo')
- `provider_video_id` (string, armazena ID no provedor)

**Compatibilidade:**
- Código existente que verifica `provider` continua funcionando
- Mux videos permanecem intactos (provider='mux')
- Novos videos têm provider='google_drive'
- Playback handler escolhe lógica baseada em provider

### Com Autenticação Supabase

**Fluxo seguro:**
1. Middleware verifica sessão Supabase
2. Se autenticado, `userId` está disponível
3. API routes acessam `auth.users` para `user_id`
4. RLS garante isolamento de dados (cada usuário vê só seu Drive)

### Com Estrutura de Pastas

**Hierarquia:**
```
Drive/
├── Plataforma de Treinamento/
│   ├── Biblioteca/
│   │   ├── Técnica A/
│   │   │   ├── Módulo A1/
│   │   │   │   └── video.mp4
│   │   │   └── Módulo A2/
│   │   └── Técnica B/
│   ├── Arquivo/
│   └── Sincronização/
└── [aluno tem] Vídeos Pessoais/
    ├── video-pessoal-1.mp4
    └── video-pessoal-2.mp4
```

**Manutenção:**
- Tabela `drive_folder_mappings` armazena IDs para rápida lookup
- Ao criar técnica/módulo novo, cria pasta correspondente
- Ao arquivar, move para pasta "Arquivo"

---

## Error Handling

### Cenários de Erro Comuns

#### 1. **Token Expirado**
```typescript
Error: { code: 401, message: "Invalid access token" }

Tratamento:
1. Service tenta refresh_token
2. Se refresh falha: redireciona para reconexão
3. UI exibe toast: "Sua conexão expirou. Reconecte ao Google Drive"
4. Botão "Reconectar" redireciona para OAuth flow
```

#### 2. **Permissão Negada**
```typescript
Error: { code: 403, message: "Drive#denied" }

Tratamento:
1. Usuário removeu permissão da app
2. UI exibe: "A plataforma não tem permissão para acessar seu Drive"
3. Botão "Reconectar" requer consentimento novamente
```

#### 3. **Arquivo Não Encontrado**
```typescript
Error: { code: 404, message: "File not found" }

Tratamento:
1. Arquivo foi deletado do Drive ou compartilhamento revogado
2. UI exibe para aluno: "Vídeo não está disponível"
3. Marca em video_access_audit para debugging
4. Opcionalmente oferece fallback se existe cópia em Mux
```

#### 4. **Quota Excedida**
```typescript
Error: { code: 429, message: "Quota exceeded" }

Tratamento:
1. Implementa rate limiting (circuit breaker)
2. Retry com exponential backoff (2s, 4s, 8s, ...)
3. Se persistir: UI exibe "Limite de operações diárias atingido"
4. Logging detalhado para monitoramento
```

#### 5. **Timeout**
```typescript
Error: timeout > 30s

Tratamento:
1. Cancela operação
2. UI exibe: "Conexão lenta. Tente novamente"
3. Retry automático com exponential backoff
4. Log de timeout para debugging
```

### Error Hierarchy

```typescript
class GoogleDriveError extends Error {
  code: string; // 'token_expired', 'permission_denied', 'not_found', etc
  statusCode: number; // HTTP status
  userMessage: string; // Mensagem amigável para UI
  details?: object; // Detalhes técnicos para log
}

Tipos específicos:
- TokenExpiredError (401)
- PermissionDeniedError (403)
- FileNotFoundError (404)
- QuotaExceededError (429)
- NetworkTimeoutError (custom)
- InvalidFileError (400)
```

---

## Security Considerations

### 1. **Token Storage**
- Access tokens e refresh tokens são criptografados antes de salvar no banco
- Usar extensão `pgcrypto` do PostgreSQL
- Chave de encriptação armazenada em environment variable

### 2. **Scope Minimization**
- Usar scope `drive.file` (limite a files criados pela app)
- Nunca usar scopes globais como `drive`

### 3. **HTTPS Only**
- Todas as chamadas a Google Drive API via HTTPS
- Redirect URLs registradas como HTTPS

### 4. **Authorization Checks**
- RLS policies verificam `user_id` em `videos` table
- Antes de gerar playback URL: verificar se aluno tem acesso (enrollments + biblioteca permissions)
- Google Drive verifica permissões no próprio sistema (verificação extra)

### 5. **Audit Logging**
- Cada acesso a vídeo registrado em `video_access_audit`
- Inclui timestamp, user_id, IP, user_agent
- Revisão periódica para atividade suspeita

### 6. **No Local Storage**
- Vídeos nunca são baixados localmente
- URLs são efêmeras (expiram em 1 hora)
- Metadata apenas (duração, tamanho) é cacheada localmente

---

## Testing Strategy

### Unit Tests

**Testes de validação:**
- Validação de arquivo (tipo MIME, magic bytes, tamanho)
- Validação de formato de vídeo suportado
- Validação de token (expirado, inválido)

**Testes de erros:**
- Comportamento quando token expirado
- Comportamento quando arquivo não encontrado
- Comportamento com quota excedida
- Timeout handling com retry

**Testes de integração com Google Drive:**
- Mock Google Drive API responses
- Testar fluxo de upload com arquivo de teste
- Testar geração de URL com mock tokens

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: OAuth Token Encryption

For any OAuth token stored in the database, the stored value SHALL be encrypted and unreadable as plaintext, yet decryptable to the original token value using the system's encryption key.

**Validates: Requirements 13.1**

### Property 2: Token Refresh on Expiry

For any API operation requiring an access token that is within 5 minutes of expiration, the system SHALL automatically refresh the token using the stored refresh token before performing the operation.

**Validates: Requirements 1.7, 2.3, 9.2**

### Property 3: Playback URL Expiration

For any playback URL generated by the system, the URL SHALL contain or reference an expiration time approximately 1 hour in the future, and the system SHALL refuse to serve that URL after expiration.

**Validates: Requirements 5.3, 5.4, 6.3, 6.4**

### Property 4: Video Upload Creates Database Record

For any video file successfully uploaded to Google Drive via the system, a corresponding record SHALL be created in the `videos` table with `provider='google_drive'` and `provider_video_id` containing the Google Drive file ID.

**Validates: Requirements 3.5, 3.6, 4.5, 4.6**

### Property 5: Folder Structure Hierarchy

For any technique and module combination, the system SHALL create a folder hierarchy in Google Drive following the pattern `/Plataforma de Treinamento/Biblioteca/[Technique]/[Module]`, and all videos uploaded to that module SHALL be placed in the corresponding module folder.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.8**

### Property 6: Permission Verification Before Playback

For any video playback request by a user, the system SHALL verify that the user has access to that video in Google Drive (either directly or through shared folder permissions) before generating and returning a playback URL.

**Validates: Requirements 5.1, 6.1, 7.6, 7.7**

### Property 7: File Format Validation

For any file upload attempt, the system SHALL validate the file's magic bytes (not just extension) and only accept formats in the list: mp4, mov, webm, avi, mkv, flv, wmv. Files with unsupported formats SHALL be rejected before being sent to Google Drive.

**Validates: Requirements 12.1, 12.3**

### Property 8: Metadata Extraction on Upload

For any video file uploaded to Google Drive, the system SHALL extract and store metadata including duration (in seconds) and file size (in bytes), obtaining these values from the Google Drive API when available.

**Validates: Requirements 11.1, 11.2**

### Property 9: Access Audit Logging

For any access to a video by any user, the system SHALL create an entry in the `video_access_audit` table containing the video_id, user_id, timestamp, IP address, and user agent.

**Validates: Requirements 13.4**

### Property 10: Token Disconnection Cleanup

For any user who disconnects their Google Drive account via the disconnect endpoint, the system SHALL remove all OAuth tokens (access_token and refresh_token) associated with that user from the `providers_oauth_tokens` table.

**Validates: Requirements 2.7, 13.3**

### Property 11: Hybrid Provider Support

For any video in the system, the playback handler SHALL check the `provider` field and route to the appropriate provider-specific logic (Google Drive if provider='google_drive', Mux if provider='mux'). Both providers SHALL coexist without conflict.

**Validates: Requirements 10.1, 14.2, 14.3**

### Property 12: Retry with Exponential Backoff

For any failed Google Drive API call due to transient errors (429, 5xx), the system SHALL retry the operation with exponential backoff (delays of approximately 2s, 4s, 8s, etc.) up to a maximum retry count before giving up.

**Validates: Requirements 15.1, 15.2**

### Property 13: Precondition Check for Student Upload

For any student attempting to upload a personal video, the system SHALL first verify that the student has an active OAuth token for Google Drive. If no token exists, the upload SHALL be rejected with a clear message before attempting the upload.

**Validates: Requirements 4.7**

### Property 14: File Size Limit Enforcement

For any video file uploaded via the system, the system SHALL reject files exceeding 5GB in size before sending them to Google Drive, with a clear error message to the user.

**Validates: Requirements 3.9, 4.8**

### Property 15: Error Logging Without User Exposure

For any Google Drive API error, the system SHALL log the full technical error details (status code, error message, stack trace) to server logs, while returning only a user-friendly error message to the client that does not expose technical implementation details.

**Validates: Requirements 9.7**

### Property 16: Playback URL Generation Under Demand

For any request for a playback URL, the system SHALL generate the URL dynamically at request time using the stored Google Drive file ID and current OAuth token. The system SHALL never store or cache playback URLs in the database.

**Validates: Requirements 5.7**

### Property 17: Token Status Display

For any authenticated user viewing the Google Drive settings page, the system SHALL display the connection status. If a valid token exists, status SHALL show "Conectado (user@gmail.com)". If no token exists, the connect button SHALL be displayed.

**Validates: Requirements 1.6, 2.6**

### Property 18: Module Archival Preserves Videos

For any module that is archived/deleted, all videos associated with that module in Google Drive SHALL be moved to an archive folder (`/Plataforma de Treinamento/Arquivo`), preserving the video records in the database with an `archived_at` timestamp.

**Validates: Requirements 8.6**

### Property 19: Metadata Synchronization

For any video whose metadata (title, description) is updated in the database, the system SHALL also update the corresponding file metadata in Google Drive to keep both sources synchronized.

**Validates: Requirements 11.4**

---

## Testing Strategy

### Unit Testing Approach

Unit tests verify specific examples, edge cases, and error conditions:

**Token Management Tests:**
- Encryption/decryption round-trip for OAuth tokens
- Token expiration detection and refresh triggering
- Invalid token rejection with appropriate error codes

**File Validation Tests:**
- File format validation using magic bytes
- Rejection of unsupported formats with correct error messages
- File size limit enforcement (5GB max)
- Empty file handling

**Folder Structure Tests:**
- Folder hierarchy creation on first connection (root → library → technique → module)
- Folder mapping storage in `drive_folder_mappings` table
- Navigation of existing folder structures when reconnecting

**Authorization Tests:**
- Permission verification returns 403 for unauthorized users
- Permission verification returns playback URL for authorized users
- Audit log entries created for each access with correct fields (user_id, video_id, timestamp, IP, user_agent)

**Error Handling Tests:**
- Token expired error triggers refresh attempt
- Google Drive API timeout (>30s) returns appropriate error
- Quota exceeded error returns specific message
- File not found error returns specific message
- Revoked permissions error returns specific message

**Metadata Tests:**
- Duration and size extraction from Google Drive file metadata
- Fallback to default values if metadata unavailable
- Metadata update round-trip (DB → Drive → DB)

**Provider Routing Tests:**
- Playback handler routes correctly for provider='google_drive'
- Playback handler routes correctly for provider='mux'
- Mixed provider videos work correctly without conflicts

### Property-Based Testing Approach

Property tests verify universal properties across many generated inputs using a PBT framework (e.g., fast-check, Hypothesis, QuickCheck equivalent for TypeScript).

**Minimum Configuration:** 100+ iterations per property test

**Property Test Implementation Requirements:**

1. **Property 1: OAuth Token Encryption**
   - Generator: Random valid OAuth token strings
   - Test: Store token, retrieve it, verify it's encrypted, decrypt it, compare with original
   - Tag: `Feature: google-drive-video-storage, Property 1: OAuth Token Encryption`

2. **Property 2: Token Refresh on Expiry**
   - Generator: Random timestamps within 5 minutes of current time
   - Test: Set token expiry to generated time, attempt operation, verify refresh is triggered
   - Tag: `Feature: google-drive-video-storage, Property 2: Token Refresh on Expiry`

3. **Property 3: Playback URL Expiration**
   - Generator: Random video IDs and user IDs
   - Test: Generate URL, check expiration time is ~1 hour ahead, wait (in test), verify URL fails after expiry
   - Tag: `Feature: google-drive-video-storage, Property 3: Playback URL Expiration`

4. **Property 4: Video Upload Creates Database Record**
   - Generator: Random video files with metadata
   - Test: Upload file, verify record in DB with correct provider and provider_video_id
   - Tag: `Feature: google-drive-video-storage, Property 4: Video Upload Creates Database Record`

5. **Property 5: Folder Structure Hierarchy**
   - Generator: Random technique and module names
   - Test: Create technique+module, verify folder structure, upload video, verify file in correct folder
   - Tag: `Feature: google-drive-video-storage, Property 5: Folder Structure Hierarchy`

6. **Property 6: Permission Verification Before Playback**
   - Generator: Random user IDs, video IDs, permission states
   - Test: With permission, playback URL returned; without permission, 403 returned
   - Tag: `Feature: google-drive-video-storage, Property 6: Permission Verification Before Playback`

7. **Property 7: File Format Validation**
   - Generator: Supported and unsupported file formats
   - Test: Upload supported formats (pass), unsupported formats (fail with error)
   - Tag: `Feature: google-drive-video-storage, Property 7: File Format Validation`

8. **Property 8: Metadata Extraction on Upload**
   - Generator: Random video files with various durations and sizes
   - Test: Upload file, verify duration_seconds and size_bytes are stored accurately
   - Tag: `Feature: google-drive-video-storage, Property 8: Metadata Extraction on Upload`

9. **Property 9: Access Audit Logging**
   - Generator: Random user IDs, video IDs, IP addresses
   - Test: Access video, verify audit log entry created with all fields populated correctly
   - Tag: `Feature: google-drive-video-storage, Property 9: Access Audit Logging`

10. **Property 10: Token Disconnection Cleanup**
    - Generator: Random user IDs with multiple tokens
    - Test: Disconnect user, verify all tokens removed from database
    - Tag: `Feature: google-drive-video-storage, Property 10: Token Disconnection Cleanup`

11. **Property 11: Hybrid Provider Support**
    - Generator: Random videos with provider='google_drive' or provider='mux'
    - Test: Request playback for each type, verify correct handler is used, no conflicts
    - Tag: `Feature: google-drive-video-storage, Property 11: Hybrid Provider Support`

12. **Property 12: Retry with Exponential Backoff**
    - Generator: Random failure scenarios (429, 500, 502, etc.)
    - Test: Simulate failures, verify retries happen with increasing delays, eventually succeed or fail appropriately
    - Tag: `Feature: google-drive-video-storage, Property 12: Retry with Exponential Backoff`

13. **Property 13: Precondition Check for Student Upload**
    - Generator: Random students with/without Google Drive tokens
    - Test: Students without token: upload rejected; with token: upload proceeds
    - Tag: `Feature: google-drive-video-storage, Property 13: Precondition Check for Student Upload`

14. **Property 14: File Size Limit Enforcement**
    - Generator: Random file sizes below and above 5GB
    - Test: Files ≤5GB: proceed; files >5GB: rejected with specific message
    - Tag: `Feature: google-drive-video-storage, Property 14: File Size Limit Enforcement`

15. **Property 15: Error Logging Without User Exposure**
    - Generator: Random API errors with technical details
    - Test: Verify server logs contain technical details, user response contains only friendly message
    - Tag: `Feature: google-drive-video-storage, Property 15: Error Logging Without User Exposure`

16. **Property 16: Playback URL Generation Under Demand**
    - Generator: Random video IDs and timestamps
    - Test: Generate URL, verify it's different if requested again with new timestamp, verify DB has no cached URLs
    - Tag: `Feature: google-drive-video-storage, Property 16: Playback URL Generation Under Demand`

17. **Property 17: Token Status Display**
    - Generator: Random users with/without Google Drive tokens
    - Test: User with token: display shows "Conectado"; without token: display shows connect button
    - Tag: `Feature: google-drive-video-storage, Property 17: Token Status Display`

18. **Property 18: Module Archival Preserves Videos**
    - Generator: Random modules with random videos
    - Test: Archive module, verify videos moved to archive folder in Drive, verify DB records have archived_at timestamp
    - Tag: `Feature: google-drive-video-storage, Property 18: Module Archival Preserves Videos`

19. **Property 19: Metadata Synchronization**
    - Generator: Random video metadata updates
    - Test: Update metadata in DB, verify Google Drive file metadata updated, retrieve and verify both match
    - Tag: `Feature: google-drive-video-storage, Property 19: Metadata Synchronization`

### Test Organization

Tests colocated with implementation:
- `lib/services/google-drive.service.test.ts` — Service unit and property tests
- `app/api/google-drive/upload/route.test.ts` — Upload endpoint tests
- `app/api/google-drive/playback/route.test.ts` — Playback endpoint tests
- `app/api/google-drive/oauth/callback/route.test.ts` — OAuth callback tests
- `components/GoogleDriveConnectButton.test.tsx` — UI component tests

### Coverage Goals

- Service layer: 90%+ line coverage
- API routes: 85%+ line coverage  
- UI components: 80%+ line coverage
- Property tests: All 19 properties implemented with 100+ iterations each
- Integration tests: OAuth flow end-to-end, upload + playback flow



