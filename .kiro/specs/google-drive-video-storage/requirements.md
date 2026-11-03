# Requisitos: Armazenamento de Vídeos no Google Drive

## Introdução

Esta feature substitui o provedor de vídeos atual (Mux) por uma integração com Google Drive. O sistema permite que instrutores autorizem a plataforma a acessar seu Google Drive e alunos a acessar seu Drive pessoal. Vídeos ficam armazenados nos Drives correspondentes, enquanto as URLs são mantidas no banco de dados. A permissão de acesso é gerenciada nativamente via compartilhamento do Google Drive, não pela plataforma.

## Glossário

- **Google_Drive**: Serviço de armazenamento em nuvem da Google
- **Drive_de_Biblioteca**: Google Drive do instrutor contendo vídeos de técnicas e módulos
- **Drive_Pessoal**: Google Drive do próprio aluno contendo seus vídeos pessoais
- **OAuth_Token**: Token de autenticação OAuth 2.0 concedido pela Google após autorização
- **Google_Drive_API**: API HTTP para interagir com Google Drive (upload, download, compartilhamento)
- **Drive_ID**: Identificador único do Google Drive de um usuário
- **Arquivo_de_Vídeo**: Arquivo em formato de vídeo (mp4, mov, etc) armazenado no Drive
- **URL_de_Reprodução**: Link direto para reprodução embutida do vídeo na plataforma
- **Permissão_de_Acesso**: Configuração de compartilhamento do Drive (quem pode ver/editar)
- **Sistema**: Plataforma de gerenciamento de aulas (software sendo desenvolvido)
- **Instrutor**: Usuário com papel de professor/instrutor
- **Aluno**: Usuário com papel de estudante
- **Biblioteca_de_Técnicas**: Coleção hierárquica de técnicas, módulos e vídeos do instrutor
- **Vídeos_Pessoais**: Vídeos particulares de um aluno armazenados em seu Drive pessoal

## Requisitos

### Requisito 1: Autorização Inicial do Instrutor no Google Drive

**User Story:** Como instrutor, quero autorizar a plataforma a acessar meu Google Drive, para que meus vídeos de biblioteca fiquem armazenados lá de forma segura.

#### Critérios de Aceitação

1. WHEN instrutor acessa a página de configurações, THE Sistema SHALL exibir um botão "Conectar ao Google Drive"
2. WHEN instrutor clica em "Conectar ao Google Drive", THE Sistema SHALL redirecionar para o fluxo de autorização OAuth 2.0 do Google
3. WHEN instrutor concede permissão na tela de consentimento do Google, THE Sistema SHALL receber um OAuth_Token válido
4. THE Sistema SHALL armazenar o OAuth_Token de forma segura no banco de dados, associado à conta do instrutor
5. WHEN o armazenamento do token é bem-sucedido, THE Sistema SHALL redirecionar o instrutor de volta com confirmação visual
6. WHEN um OAuth_Token já existe e é válido, THE Sistema SHALL exibir status "Conectado" em vez do botão de conexão
7. WHEN um OAuth_Token expira, THE Sistema SHALL automaticamente solicitar um novo token na próxima operação que necessite acesso ao Drive
8. IF o instrutor revogar permissões no Google (configurações de apps conectados), THEN THE Sistema SHALL detectar a falta de acesso na próxima operação e solicitar reconexão

### Requisito 2: Autorização Inicial do Aluno no Google Drive

**User Story:** Como aluno, quero autorizar a plataforma a acessar meu Google Drive pessoal, para que eu possa armazenar vídeos privados lá.

#### Critérios de Aceitação

1. WHEN aluno acessa a página de perfil ou configurações, THE Sistema SHALL exibir um botão "Conectar ao Google Drive Pessoal"
2. WHEN aluno clica em "Conectar ao Google Drive Pessoal", THE Sistema SHALL redirecionar para o fluxo de autorização OAuth 2.0 do Google
3. WHEN aluno concede permissão na tela de consentimento do Google, THE Sistema SHALL receber um OAuth_Token válido
4. THE Sistema SHALL armazenar o OAuth_Token de forma segura no banco de dados, associado à conta do aluno
5. WHEN o armazenamento do token é bem-sucedido, THE Sistema SHALL redirecionar o aluno de volta com confirmação visual
6. WHEN um OAuth_Token já existe e é válido, THE Sistema SHALL exibir status "Conectado" em vez do botão de conexão
7. WHERE [opcional] O aluno pode desconectar sua conta do Google Drive através de um botão "Desconectar", THE Sistema SHALL remover o OAuth_Token armazenado

### Requisito 3: Upload de Vídeos de Biblioteca do Instrutor

**User Story:** Como instrutor, quero fazer upload de vídeos para meu Google Drive através da plataforma, para que fiquem organizados na Biblioteca_de_Técnicas.

#### Critérios de Aceitação

1. WHEN instrutor está na página de gerenciamento de biblioteca (módulo ou técnica), THE Sistema SHALL exibir um botão "Fazer Upload de Vídeo"
2. WHEN instrutor clica em "Fazer Upload de Vídeo", THE Sistema SHALL abrir uma caixa de diálogo para seleção de arquivo
3. WHEN instrutor seleciona um Arquivo_de_Vídeo válido (mp4, mov, webm, avi), THE Sistema SHALL iniciar o upload
4. WHEN o upload está em progresso, THE Sistema SHALL exibir indicador de progresso com percentual
5. WHEN o upload é concluído, THE Sistema SHALL criar um registro de Vídeo no banco de dados com provider="google_drive"
6. THE Sistema SHALL armazenar o ID do arquivo no Google Drive no campo provider_video_id
7. WHEN o upload falha por falta de espaço no Drive, THEN THE Sistema SHALL exibir erro descritivo: "Espaço insuficiente no Google Drive"
8. WHEN o upload falha por OAuth_Token expirado, THEN THE Sistema SHALL solicitar reconexão e permitir nova tentativa
9. IF o arquivo de vídeo ultrapassa o tamanho máximo permitido (5GB), THEN THE Sistema SHALL rejeitar o arquivo com mensagem clara

### Requisito 4: Upload de Vídeos Pessoais do Aluno

**User Story:** Como aluno, quero fazer upload de vídeos para meu Google Drive pessoal através da plataforma, para que eu possa compartilhá-los com meu instrutor se necessário.

#### Critérios de Aceitação

1. WHEN aluno acessa sua área de Vídeos_Pessoais, THE Sistema SHALL exibir um botão "Fazer Upload de Vídeo Pessoal"
2. WHEN aluno clica em "Fazer Upload de Vídeo Pessoal", THE Sistema SHALL abrir uma caixa de diálogo para seleção de arquivo
3. WHEN aluno seleciona um Arquivo_de_Vídeo válido (mp4, mov, webm, avi), THE Sistema SHALL iniciar o upload
4. WHEN o upload está em progresso, THE Sistema SHALL exibir indicador de progresso com percentual
5. WHEN o upload é concluído, THE Sistema SHALL criar um registro de vídeo pessoal no banco de dados com provider="google_drive"
6. THE Sistema SHALL armazenar o ID do arquivo no Google Drive do aluno no campo provider_video_id
7. IF o aluno não tem Google Drive conectado, THEN THE Sistema SHALL exibir mensagem solicitando conexão antes do upload
8. IF o arquivo de vídeo ultrapassa o tamanho máximo permitido (5GB), THEN THE Sistema SHALL rejeitar o arquivo com mensagem clara

### Requisito 5: Obtenção de URL de Reprodução para Vídeos de Biblioteca

**User Story:** Como sistema, eu preciso obter URLs de reprodução para vídeos da biblioteca do instrutor, para que alunos autorizados possam assistir embutido na plataforma.

#### Critérios de Aceitação

1. WHEN um aluno autorizado tenta visualizar um vídeo de biblioteca, THE Sistema SHALL gerar uma URL_de_Reprodução do Google Drive
2. THE Sistema SHALL usar a Google_Drive_API para gerar uma URL de prévia (embed URL) do arquivo de vídeo
3. THE URL_de_Reprodução SHALL conter um token de acesso que expira em tempo limite realista (ex: 1 hora)
4. WHEN a URL_de_Reprodução expira, THE Sistema SHALL gerar uma nova URL na próxima solicitação do aluno
5. WHERE [player] O Sistema pode usar um player HTML5 ou iframe do Google Drive para exibição, THE URL deve ser compatível com esse método
6. IF o instrutor revogou o acesso ao Drive, THEN THE Sistema SHALL detectar isso e exibir erro ao aluno: "Vídeo temporariamente indisponível"
7. THE Sistema SHALL nunca armazenar URLs_de_Reprodução permanentemente no banco de dados (gerar sob demanda)

### Requisito 6: Obtenção de URL de Reprodução para Vídeos Pessoais do Aluno

**User Story:** Como sistema, eu preciso obter URLs de reprodução para vídeos pessoais armazenados no Drive do aluno, para que o aluno e seu instrutor autorizado possam assistir.

#### Critérios de Aceitação

1. WHEN um aluno tenta visualizar seu próprio vídeo pessoal, THE Sistema SHALL gerar uma URL_de_Reprodução do Google Drive usando seu OAuth_Token
2. WHEN um instrutor acessa um vídeo pessoal de seu aluno (com permissão), THE Sistema SHALL usar o OAuth_Token do aluno para gerar a URL
3. THE URL_de_Reprodução deve expirar em tempo limite realista (ex: 1 hora)
4. WHEN a URL_de_Reprodução expira, THE Sistema SHALL gerar uma nova URL na próxima solicitação
5. IF o aluno removeu ou revogou acesso ao Drive, THEN THE Sistema SHALL detectar isso e exibir erro: "Vídeo pessoal indisponível"
6. THE Sistema SHALL garantir que apenas o aluno dono e seu instrutor possam acessar a URL

### Requisito 7: Permissão de Acesso via Google Drive (Compartilhamento Nativo)

**User Story:** Como instrutor, quero gerenciar quem tem acesso aos vídeos de minha biblioteca, usando o compartilhamento nativo do Google Drive, sem que a plataforma controle permissões.

#### Critérios de Aceitação

1. THE Sistema SHALL NOT implementar sistema próprio de autorização de acesso a vídeos de biblioteca
2. THE Sistema SHALL confiar exclusivamente no compartilhamento de pastas/arquivos do Google Drive
3. WHEN a Biblioteca_de_Técnicas é criada, THE Sistema SHALL criar uma pasta correspondente no Drive do instrutor
4. WHEN um vídeo é enviado para a biblioteca, THE Sistema SHALL armazená-lo nesta pasta
5. THE Sistema SHALL exibir instruções claras ao instrutor: "Compartilhe a pasta de biblioteca no seu Drive para controlar quem tem acesso"
6. WHEN um aluno não tem acesso à pasta no Drive, THE Sistema SHALL exibir erro ao tentar visualizar: "Você não tem permissão para acessar este vídeo"
7. THE Sistema SHALL verificar permissões consultando o Google Drive antes de fornecer a URL_de_Reprodução

### Requisito 8: Estrutura de Pastas no Google Drive

**User Story:** Como instrutor, quero que meus vídeos e biblioteca estejam organizados em uma estrutura clara no meu Google Drive, para que seja fácil gerenciar compartilhamento.

#### Critérios de Aceitação

1. WHEN um instrutor conecta seu Drive pela primeira vez, THE Sistema SHALL criar uma pasta raiz: "/Plataforma de Treinamento"
2. WITHIN essa pasta raiz, THE Sistema SHALL criar subpastas: "/Biblioteca" para vídeos de biblioteca
3. WITHIN a pasta "/Biblioteca", THE Sistema SHALL criar subpastas por Técnica com nomes descritivos
4. WITHIN cada pasta de Técnica, THE Sistema SHALL criar subpastas por Módulo
5. WHEN um vídeo é enviado, THE Sistema SHALL salvá-lo na pasta correspondente do Módulo
6. WHEN um Módulo é excluído (arquivado), THE Sistema SHALL mover seus vídeos para uma pasta "/Arquivo" para preservar histórico
7. FOR alunos, THE Sistema SHALL criar uma pasta "/Vídeos Pessoais" no Drive pessoal do aluno
8. THE estrutura de pastas deve refletir a hierarquia de Técnica → Módulo → Vídeo

### Requisito 9: Tratamento de Erros de Conectividade com Google Drive

**User Story:** Como sistema, eu preciso lidar com falhas na comunicação com Google Drive de forma graceful, para que o usuário receba feedbacks claros.

#### Critérios de Aceitação

1. WHEN a Google_Drive_API não responde dentro de 30 segundos, THEN THE Sistema SHALL exibir erro com timeout
2. WHEN o OAuth_Token é inválido ou revogado, THEN THE Sistema SHALL detectar e solicitar reconexão
3. WHEN há erro de autenticação (401), THEN THE Sistema SHALL redirecionar para novo OAuth flow
4. WHEN há erro de permissão (403), THEN THE Sistema SHALL exibir: "A plataforma não tem permissão para acessar esta pasta"
5. WHEN há erro de recurso não encontrado (404), THEN THE Sistema SHALL exibir: "Arquivo ou pasta não encontrado no Drive"
6. WHEN há erro de quota excedida (quota_exceeded), THEN THE Sistema SHALL exibir: "Espaço insuficiente no Google Drive"
7. ALL erros de conectividade devem ser registrados em log para debugging, sem expor detalhes técnicos ao usuário

### Requisito 10: Migração de Vídeos Existentes do Mux para Google Drive

**User Story:** Como sistema, eu preciso migrar vídeos já armazenados no Mux para Google Drive, para que a transição seja suave e não haja perda de dados.

#### Critérios de Aceitação

1. THE Sistema SHALL suportar modo híbrido durante a migração: vídeos Mux antigos e vídeos Google Drive coexistem
2. WHEN um vídeo Mux é solicitado para reprodução e Google Drive está configurado, THE Sistema pode opcionalmente reanalocar o vídeo
3. WHERE [opcional - pós MVP] O Instrutor pode executar uma migração em lote de todos os vídeos Mux para Google Drive via ação de admin
4. THE migração deve preservar: metadata (título, descrição), timestamps (created_at, updated_at), associações (módulo, técnica)
5. WHEN a migração é completada, THE Sistema SHALL marcar vídeos Mux antigos como "migrados" ou "arquivados"
6. IF houver falha durante a migração de um vídeo individual, THEN THE Sistema SHALL registrar o erro e continuar com próximos vídeos
7. THE Sistema SHALL manter um registro de auditoria (log) de todas as migrações realizadas

### Requisito 11: Sincronização de Metadados de Vídeos

**User Story:** Como sistema, eu preciso manter metadados de vídeos sincronizados (título, duração, thumbnail), para que a UI exiba informações precisas.

#### Critérios de Aceitação

1. WHEN um vídeo é enviado para Google Drive via Sistema, THE Sistema SHALL obter metadados iniciais (duração, tamanho)
2. WHERE informações estão disponíveis na Google_Drive_API, THE Sistema SHALL extrair e armazenar: duração_segundos, tamanho_bytes
3. WHERE thumbnail_url não pode ser obtida via API, THE Sistema pode opcionalmente gerar um thumbnail placeholder
4. WHEN um vídeo é atualizado (título, descrição alterado), THE Sistema SHALL atualizar ambos: banco de dados e metadados do arquivo no Drive
5. IF metadados não conseguem ser obtidos via API, THEN THE Sistema SHALL usar valores padrão e registrar um warning em log

### Requisito 12: Suporte a Diferentes Formatos de Vídeo

**User Story:** Como instrutor ou aluno, quero fazer upload de vídeos em diferentes formatos, para que eu possa usar arquivos de várias fontes.

#### Critérios de Aceitação

1. THE Sistema SHALL aceitar formatos: mp4, mov, webm, avi, mkv, flv, wmv
2. WHEN um usuário tenta fazer upload de formato não suportado, THEN THE Sistema SHALL rejeitar com mensagem: "Formato de arquivo não suportado"
3. WHEN um vídeo é carregado, THE Sistema SHALL validar o arquivo (magic bytes) antes de enviar ao Drive
4. THE reprodução via Google Drive deve funcionar com todos os formatos aceitos (compatibilidade com player padrão)
5. IF o formato é muito incomum e pode causar problema, THE Sistema deve alertar o instrutor/aluno

### Requisito 13: Segurança e Conformidade com Dados de Vídeo

**User Story:** Como usuário, eu quero que meus dados de vídeo fiquem seguros e em conformidade com políticas de privacidade.

#### Critérios de Aceitação

1. ALL OAuth_Tokens devem ser armazenados criptografados no banco de dados (não em plaintext)
2. THE Sistema SHALL usar HTTPS para todas as comunicações com Google_Drive_API
3. WHEN um usuário desconecta sua conta do Drive, THE Sistema SHALL remover tokens criptografados do banco de dados
4. ALL acessos a vídeos devem ser auditados: log de quem acessou qual vídeo, quando
5. THE Sistema SHALL respeitar as permissões de compartilhamento do Google Drive (não contornar)
6. IF um vídeo é deletado do Drive pelo usuário, THE Sistema pode marcar como "indisponível" sem apagá-lo do banco de dados
7. THE Sistema SHALL nunca baixar ou armazenar cópias locais de vídeos (somente URLs)

### Requisito 14: Integração com Estrutura Existente de Vídeos

**User Story:** Como sistema, eu preciso manter compatibilidade com a estrutura existente de vídeos (campo `provider`, `provider_video_id`), para que a integração seja mínima.

#### Critérios de Aceitação

1. THE Sistema SHALL manter a coluna `provider` na tabela de vídeos com valor "google_drive" para novos vídeos
2. THE Sistema SHALL continuar suportando provider="mux" para vídeos antigos (modo híbrido)
3. WHEN um vídeo é solicitado para reprodução, THE Sistema SHALL verificar o `provider` e usar a lógica apropriada
4. WHERE [deprecated] provider="demo" pode continuar suportado para modo de demonstração local
5. THE Schema de banco de dados não requer alterações estruturais para suportar Google Drive

### Requisito 15: Limitações de Taxa (Rate Limiting) na API do Google Drive

**User Story:** Como sistema, eu preciso respeitar limites de taxa da Google_Drive_API, para não exceder quotas.

#### Critérios de Aceitação

1. THE Sistema SHALL implementar circuit breaker ou retry com backoff exponencial para chamadas à API
2. WHEN limite de requisições é atingido, THEN THE Sistema SHALL aguardar e redirecionar a solicitação após delay apropriado
3. IF quota diária do Google Drive é excedida, THEN THE Sistema SHALL exibir mensagem: "Limite de operações diárias do Google Drive foi atingido. Tente novamente amanhã"
4. ALL tentativas falhas devem ser registradas em log para monitoramento
5. THE Sistema deve priorizar reprodução de vídeos sobre outras operações quando quotas estão baixas

## Princípios de Design

1. **Sem Sistema Próprio de Permissões:** A plataforma confia no compartilhamento nativo do Google Drive, não implementa ACL própria
2. **Armazenamento em Nuvem:** Todos os vídeos ficam no Drive, nunca são baixados ou armazenados localmente
3. **URLs Efêmeras:** URLs de reprodução são geradas sob demanda com expiração, nunca armazenadas permanentemente
4. **Compatibilidade Retroativa:** Modo híbrido Mux + Google Drive durante migração
5. **Organização Hierárquica:** Estrutura de pastas no Drive reflete a hierarquia Técnica → Módulo
6. **Segurança de Token:** Tokens OAuth armazenados criptografados, nunca em plaintext
7. **Gestão de Erros Clara:** Usuários recebem mensagens descritivas, logs técnicos para debugging

## Dependências

- Google Drive API v3
- OAuth 2.0 para autenticação
- Supabase para armazenamento de tokens criptografados
- Supabase para auditoria de acessos (logs)
- Continuação do provedor Mux durante migração gradual (se aplicável)

## Impacto na Arquitetura

1. **Nova tabela ou campo:** Pode ser necessário adicionar coluna de criptografia de tokens ou usar extensão pgcrypto
2. **Novos serviços:** Serviço dedicado para integração Google Drive (`lib/services/google-drive.service.ts`)
3. **Novos endpoints API:** Endpoints OAuth callback, upload, obtenção de URLs
4. **Novos componentes UI:** Upload dialogs, status de conexão, gerenciador de pastas
5. **Middleware de autorização:** Verificação de permissões do Drive antes de fornecer URLs
