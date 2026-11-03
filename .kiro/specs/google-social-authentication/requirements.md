# Documento de Requisitos: Google Social Authentication

## Introdução

Esta especificação define a integração de autenticação social via Google na plataforma existente de Supabase Auth. A feature permitirá que usuários façam login/signup utilizando suas contas Google, com conexão automática ao Google Drive para operações futuras de armazenamento de vídeos.

## Glossário

- **Google OAuth**: Protocolo de autenticação delegada que permite acesso às contas Google do usuário
- **Access Token**: Token de curta duração fornecido pelo Google para acessar APIs em nome do usuário
- **Refresh Token**: Token de longa duração usado para obter novos access tokens sem reautentica
- **Supabase Auth**: Serviço de autenticação gerenciado usado pela plataforma (atualmente email/password)
- **Google Identity Services**: APIs do Google para autenticação e gerenciamento de contas
- **OAuth Scope**: Permissões específicas solicitadas ao usuário (ex: acesso ao Google Drive)
- **OAuth Consent Screen**: Tela apresentada ao usuário no Google mostrando as permissões solicitadas
- **Credential**: Dados de identidade do usuário (email, nome, foto de perfil)
- **Token Encryption**: Criptografia dos tokens armazenados no banco de dados

## Requisitos

### Requisito 1: Login com Google

**User Story:** Como usuário, quero fazer login na plataforma usando minha conta Google, para que eu não precise manter outra senha.

#### Critérios de Aceitação

1. QUANDO um usuário não autenticado acessa a página de login, O Sistema DEVE exibir um botão "Continuar com Google" junto às opções existentes de login por email
2. QUANDO um usuário clica no botão "Continuar com Google", O Sistema DEVE redirecionar para o Google OAuth Consent Screen com scopes: `openid profile email https://www.googleapis.com/auth/drive`
3. QUANDO o usuário autoriza o acesso e retorna da autenticação Google, O Sistema DEVE validar o Google Authorization Code através do endpoint Google de token
4. QUANDO a validação retorna sucesso, O Sistema DEVE verificar se existe um usuário Supabase com o mesmo email retornado pelo Google
5. QUANDO o usuário existe, O Sistema DEVE automaticamente fazer login na conta existente (vinculando Google Identity)
6. QUANDO o Google retorna uma credential válida, O Sistema DEVE armazenar o Access Token do Google de forma criptografada no banco de dados
7. QUANDO o Access Token é armazenado, O Sistema DEVE registrar o timestamp de expiração do token
8. QUANDO o login Google é concluído com sucesso, O Sistema DEVE criar uma sessão Supabase válida e redirecionar o usuário para o dashboard

### Requisito 2: Signup com Google

**User Story:** Como novo usuário, quero criar uma conta usando Google, para que eu possa começar a usar a plataforma imediatamente.

#### Critérios de Aceitação

1. QUANDO um usuário clica "Continuar com Google" na página de signup, O Sistema DEVE seguir o mesmo fluxo de autenticação do Requisito 1
2. QUANDO um usuário Google retorna e não existe conta Supabase com o email, O Sistema DEVE criar automaticamente um novo usuário no Supabase Auth com o email do Google
3. QUANDO criar novo usuário, O Sistema DEVE usar o email Google como identificador único
4. QUANDO criar novo usuário, O Sistema DEVE armazenar o nome e foto de perfil fornecidos pelo Google no profile do usuário
5. QUANDO criar novo usuário via Google, O Sistema DEVE determinar o papel (role) do usuário baseado em lógica padrão ou fluxo de convite
6. QUANDO novo usuário é criado, O Sistema DEVE armazenar os tokens Google (Access Token + Refresh Token) de forma criptografada
7. QUANDO o novo usuário completa signup, O Sistema DEVE redirecionar para o onboarding ou dashboard apropriado

### Requisito 3: Conectar Google Account a Conta Existente

**User Story:** Como usuário existente, quero vincular minha conta Google à minha conta existente, para que eu possa usar Google Login nas próximas vezes.

#### Critérios de Aceitação

1. QUANDO um usuário autenticado acessa suas configurações/perfil, O Sistema DEVE exibir uma seção "Contas Conectadas" que mostre status de integração Google
2. QUANDO a conta Google não está conectada, O Sistema DEVE exibir um botão "Conectar Google"
3. QUANDO usuário clica "Conectar Google", O Sistema DEVE iniciar o Google OAuth com os mesmos scopes
4. QUANDO a autenticação Google retorna sucesso, O Sistema DEVE verificar que o email Google é igual ao email da conta Supabase
5. QUANDO emails coincidem, O Sistema DEVE armazenar a Google Identity e tokens no profile do usuário autenticado
6. QUANDO conexão é bem-sucedida, O Sistema DEVE exibir uma notificação de sucesso e atualizar o status na seção "Contas Conectadas"

### Requisito 4: Armazenar Google OAuth Tokens

**User Story:** Como sistema, quero armazenar com segurança os tokens Google do usuário, para que eu possa acessar o Google Drive quando necessário.

#### Critérios de Aceitação

1. O Sistema DEVE criptografar Access Tokens antes de armazenar no banco de dados
2. O Sistema DEVE criptografar Refresh Tokens antes de armazenar no banco de dados
3. O Sistema DEVE usar uma chave de criptografia diferente para cada ambiente (development, production)
4. O Sistema DEVE armazenar timestamp de expiração do Access Token
5. O Sistema DEVE armazenar a data/hora da autenticação original
6. QUANDO tokens são armazenados, O Sistema DEVE manter log de auditoria sem exposição de valores sensíveis
7. O Sistema DEVE usar as convenções de criptografia compatíveis com Supabase (ex: algoritmo AES-256 ou similar seguro)

### Requisito 5: Gerenciar Expiração e Refresh de Tokens

**User Story:** Como sistema, quero renovar automaticamente os tokens Google expirados, para que operações com Google Drive continuem funcionando sem intervenção do usuário.

#### Critérios de Aceitação

1. QUANDO um Access Token está dentro de 5 minutos de expiração, O Sistema DEVE automaticamente usar o Refresh Token para obter novo Access Token
2. QUANDO o Refresh Token é usado com sucesso, O Sistema DEVE atualizar o Access Token criptografado no banco de dados
3. QUANDO o Refresh Token é usado com sucesso, O Sistema DEVE atualizar o timestamp de expiração
4. QUANDO o Refresh Token retorna erro (ex: usuário revogou autorização), O Sistema DEVE marcar a integração Google como desconectada
5. QUANDO a integração é marcada como desconectada, O Sistema DEVE exibir notificação ao usuário de que reconexão é necessária
6. O Sistema DEVE executar refresh de tokens apenas quando necessário (lazy loading, não background proativo)
7. QUANDO refresh falha, O Sistema DEVE retornar erro apropriado à operação que tentou usar Google Drive

### Requisito 6: Revogar/Desconectar Google Account

**User Story:** Como usuário, quero desconectar minha conta Google da plataforma, para que a plataforma não tenha mais acesso ao meu Google Drive.

#### Critérios de Aceitação

1. QUANDO usuário clica "Desconectar Google", O Sistema DEVE exibir uma confirmação perguntando se deseja realmente desconectar
2. QUANDO usuário confirma desconexão, O Sistema DEVE fazer uma chamada ao endpoint Google para revogar tokens (`https://oauth.googleapis.com/revoke`)
3. QUANDO revogação é bem-sucedida, O Sistema DEVE deletar Access Token e Refresh Token do banco de dados
4. QUANDO revogação é bem-sucedida, O Sistema DEVE marcar a integração como desconectada (isConnected = false)
5. QUANDO tokens são deletados, O Sistema DEVE criar entrada de log de auditoria
6. QUANDO desconexão é concluída, O Sistema DEVE exibir confirmação ao usuário
7. QUANDO usuário tenta usar recurso que requer Google Drive após desconexão, O Sistema DEVE exibir mensagem pedindo reconexão

### Requisito 7: Integração com Supabase Auth

**User Story:** Como sistema, quero vincular identidades Google ao Supabase Auth, para que login Google e email/password funcionem na mesma conta.

#### Critérios de Aceitação

1. QUANDO usuário faz login com Google, O Sistema DEVE usar Supabase's built-in Google provider (supabase.auth.signInWithOAuth)
2. QUANDO usar Supabase OAuth provider, O Sistema DEVE retornar para a aplicação com session Supabase válida
3. O Sistema DEVE armazenar Google Identity persistentemente associada ao usuário Supabase
4. QUANDO usuário faz login com email/password e Google já está conectado, O Sistema DEVE manter ambas as identidades ativas
5. QUANDO usuário depois conecta Google em conta email/password existente, O Sistema DEVE manter ambos métodos de autenticação
6. O Sistema DEVE usar apenas email como identificador único (múltiplas identidades podem ter o mesmo email)

### Requisito 8: Tratamento de Erros

**User Story:** Como desenvolvedor, quero que erros de autenticação Google sejam tratados graciosamente, para que usuários recebam mensagens claras.

#### Critérios de Aceitação

1. QUANDO Google retorna erro de autenticação, O Sistema DEVE capturar o erro e exibir mensagem amigável ao usuário
2. QUANDO usuário recusa autorização no Google Consent Screen, O Sistema DEVE redirecionar para página de login com mensagem explicativa
3. QUANDO Google API está indisponível, O Sistema DEVE exibir mensagem "Google temporariamente indisponível" e permitir login alternativo
4. QUANDO há erro de rede durante autenticação, O Sistema DEVE exibir mensagem "Erro de conexão" e permitir retry
5. QUANDO Access Token refresh falha com erro 401 (Unauthorized), O Sistema DEVE forçar reconexão solicitando novo consentimento
6. QUANDO há erro ao salvar tokens no banco de dados, O Sistema DEVE revert a autenticação e exibir erro genérico ao usuário
7. O Sistema DEVE registrar todos os erros em log para debugging (sem expor dados sensíveis ao usuário)

### Requisito 9: Segurança dos Tokens

**User Story:** Como usuário, quero ter certeza que meus tokens Google estão protegidos, para que minha privacidade e dados não sejam comprometidos.

#### Critérios de Aceitação

1. O Sistema DEVE usar HTTPS para todas as comunicações envolvendo tokens
2. O Sistema DEVE usar Environment Variables para armazenar chaves de criptografia (nunca hardcoded)
3. O Sistema DEVE criptografar tokens antes de persistir no banco de dados
4. O Sistema DEVE nunca expor tokens em logs, error messages ou respostas de API
5. O Sistema DEVE usar rate limiting em endpoints de autenticação Google para prevenir force brute
6. O Sistema DEVE validar que Google Authorization Code é usado apenas uma vez
7. O Sistema DEVE usar State parameter no OAuth flow para prevenir CSRF attacks
8. O Sistema DEVE implementar PKCE (Proof Key for Code Exchange) se aplicável
9. O Sistema DEVE auditar tentativas de acesso a tokens com falha
10. QUANDO usuário faz logout, O Sistema DEVE manter tokens armazenados (usuário pode fazer login novamente sem reconectar)

### Requisito 10: Consentimento e Permissões do Google

**User Story:** Como usuário, quero entender exatamente quais permissões estou dando ao conectar Google, para que eu possa tomar decisão informada.

#### Critérios de Aceitação

1. O Sistema DEVE solicitar apenas os scopes necessários: `openid profile email https://www.googleapis.com/auth/drive`
2. QUANDO usuário vê Google Consent Screen, O Sistema DEVE exibir explicação clara de por que cada permissão é necessária
3. O Sistema DEVE informar explicitamente que a plataforma acessa Google Drive (pré-requisito para video storage)
4. QUANDO usuário clica "Continuar com Google", O Sistema DEVE exibir página intermediária explicando permissões antes de redirecionar ao Google (optional, depending on UX preference)
5. O Sistema DEVE manter registro de quais scopes foram consentidos pelo usuário
6. QUANDO novos scopes são adicionados no futuro, O Sistema DEVE solicitar novo consentimento ao usuário
7. QUANDO usuário revoga permissões no Google Account, O Sistema DEVE detectar e pedir reconexão na próxima tentativa de uso

---

## Notas de Implementação

### Scopes Google OAuth

A plataforma utilizará os seguintes scopes:

- `openid`: Obter ID do usuário
- `profile`: Obter nome e foto de perfil
- `email`: Obter endereço de email
- `https://www.googleapis.com/auth/drive`: Acesso ao Google Drive (para integração futura de armazenamento de vídeos)

### Tokens Criptografados

Tokens devem ser criptografados usando algoritmo AES-256-GCM com:
- Chave única por ambiente (prod vs dev)
- IV (Initialization Vector) aleatório por token
- Salt para derivação de chave

### Fluxo de Autenticação

```
1. Usuário clica "Continuar com Google"
2. Redireciona para Google OAuth Consent Screen
3. Usuário autoriza
4. Google redireciona com Authorization Code
5. Backend valida Code com Google
6. Backend obtém Access Token + Refresh Token
7. Backend criptografa tokens
8. Backend salva no banco dados
9. Backend cria session Supabase
10. Frontend redireciona para dashboard
```

### Integração com Supabase

Usar `supabase.auth.signInWithOAuth()` com provider 'google' para gerenciar o fluxo OAuth integrado do Supabase. Tokens Google são armazenados separadamente em tabela `user_google_oauth` para fácil acesso quando necessário para Google Drive.

