# Jiu-Jitsu App

Plataforma web responsiva para professores particulares de Jiu-Jitsu planejarem aulas, gerenciarem alunos, organizarem a agenda e manterem uma biblioteca técnica com vídeos. Inclui o portal do aluno com agenda, plano publicado, histórico e biblioteca autorizada.

> **Status:** runtime em Supabase (Postgres + Auth + RLS). O modo local em `.data/db.json` permanece apenas como referência histórica e para testes.

---

## Funcionalidades

### Autenticação e perfis
- Cadastro e login de professor com e-mail/senha via Supabase Auth (cookies
  `httpOnly`) e sessão validada no servidor.
- Login, cadastro e conexão de conta Google pelo **provider Google do Supabase
  Auth**, com tokens criptografados (AES-256-GCM), refresh automático,
  desconexão e auditoria. Veja
  [`docs/google-social-authentication.md`](docs/google-social-authentication.md).
- Armazenamento de vídeos no Google Drive (instrutor e aluno), upload em chunks,
  URL de reprodução efêmera, compartilhamento nativo, auditoria de acessos,
  migração Mux → Drive e modo híbrido. Login social e Drive usam **um único
  consentimento Google**. Veja
  [`docs/google-drive-video-storage.md`](docs/google-drive-video-storage.md).
- Convite de aluno por token seguro (7 dias), aceite e criação/vinculação de conta.
- Recuperação e redefinição de senha (link com validade de 1 hora).
- Perfil com nome, e-mail, avatar (até 5MB, JPEG/PNG/WebP), nome de exibição, fuso IANA e bio.
- Detecção de papéis professor/aluno e troca de visão quando a conta possui ambos.
- Rotas protegidas por middleware e autorização revalidada no servidor.

### Gestão de alunos
- Cadastro com convite, e-mail, telefone e observações privadas.
- Listagem com busca, filtro por status e paginação (20 por página).
- Ficha com estatísticas, próxima aula, histórico, biblioteca liberada e dados do vínculo.
- Pausar, reativar, arquivar e excluir (somente sem histórico de aulas).
- Reenvio de convite invalidando o token anterior.
- E-mail único por professor entre vínculos ativos/pendentes; notas privadas nunca expostas ao aluno.

### Biblioteca de técnicas
- Hierarquia técnica → módulo → vídeo.
- CRUD, ordenação, movimentação de módulos e arquivamento em cascata.
- Vídeos com status `uploading`, `processing`, `ready`, `error` e `archived`.
- Busca global por título, playback seguro e webhook de processamento.
- Vídeos reutilizáveis em planos e aulas; exclusão bloqueada quando há referências.
- Liberação de técnicas por aluno.

### Planos mensais
- CRUD de planos com período, objetivo e descrição.
- Dias por dia da semana **ou** data específica, com objetivo, observações e vídeos ordenados.
- Rascunho → publicado → arquivado, com `published_at` preservado para auditoria.
- Duplicação como rascunho (dias e vídeos copiados, acessos não).
- Publicação explícita por aluno; rascunhos nunca aparecem no portal.
- Exclusão bloqueada quando há aulas vinculadas.

### Agenda e aulas
- Visão semanal e diária, com status e conflitos de horário.
- Aula concreta com aluno, período, dia do plano, notas compartilhadas/privadas e vídeos.
- Conclusão, cancelamento e falta; aulas finais ficam imutáveis (exceto notas).
- Cópia de vídeos sugeridos pelo plano, sem duplicar associações.
- Horários recorrentes com pausa/ativação, geração de sugestões em até 90 dias e prevenção de duplicatas.
- Estatísticas por aluno e indicadores do dashboard.

### Portal do aluno
- Dashboard com próxima aula, aulas realizadas, professores e conteúdos.
- Agenda futura/passada com filtro por professor e período.
- Plano de treinamento publicado com dias e vídeos.
- Biblioteca liberada por técnica, módulo ou associação a aulas.
- Histórico paginado de aulas concluídas com observações compartilhadas e vídeos.
- Perfil editável (nome/avatar); notas privadas e dados administrativos nunca são enviados.

---

## Stack

- **Next.js 15** (App Router, Server/Client Components), **React 19**, **TypeScript strict**
- **Tailwind CSS** + componentes no estilo shadcn/ui escritos no projeto
- **Zod** para validação; **date-fns** para datas; **sonner** para toasts
- **Supabase/PostgreSQL** como alvo de produção (schema e RLS inclusos)
- **Mux** para vídeo e **Resend** para e-mail (opcionais no modo local)
- **Vitest** + **fast-check** para testes unitários e de propriedades

---

## Como rodar

```bash
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

### Contas de demonstração

| Perfil | E-mail | Senha |
|---|---|---|
| Professor | `professor@bjj.app` | `senha12345` |
| Aluno | `aluno@bjj.app` | `senha12345` |
| Aluna | `mariana@bjj.app` | `senha12345` |

Há também um convite pendente para `pedro@bjj.app`. O link pode ser reenviado na ficha do aluno ou obtido na **caixa de saída de demonstração** (tela de login). Convites e recuperação de senha ficam registrados localmente quando o Resend não está configurado.

### Dados locais

- Persistidos em `.data/db.json` (criado automaticamente com a base demo).
- Para resetar: pare o servidor, apague `.data/db.json` e inicie novamente.
- `BJJ_STORE=memory` usa apenas memória (útil em testes).

---

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Executar build |
| `npm run type-check` | TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Testes (Vitest) |
| `npm run test:watch` | Testes em watch |
| `npm run test:coverage` | Cobertura |
| `npm run test:rls` | Testes de RLS em PostgreSQL/PGlite |
| `npm run migrate:videos` | Dispara migração Mux → Google Drive (requer cookie de instrutor) |
| `npm run format` | Prettier |

---

## Configuração de produção (Supabase/Mux/Resend)

1. Copie `.env.example` para `.env.local` e preencha as chaves.
2. Aplique as migrações:

```bash
supabase db push
# ou execute manualmente:
# supabase/migrations/20261029_000001_initial_schema.sql
# supabase/migrations/20261029_000002_storage_avatars.sql
# supabase/migrations/20261103_000003_google_oauth.sql
# supabase/migrations/20261103_000004_google_drive_video_storage.sql
```

3. Configure o bucket `avatars` (a migração já cria) e as políticas RLS.
4. Configure o webhook da Mux para `POST /api/library/videos/webhook` e defina `MUX_WEBHOOK_SECRET`.
5. Defina `AUTH_SECRET` com pelo menos 32 caracteres e `NEXT_PUBLIC_APP_URL` com o domínio público.
6. Para login com Google, habilite o provider Google no Supabase Auth
   (Authentication → Providers → Google), cadastre a redirect URI
   `https://<PROJECT_REF>.supabase.co/auth/v1/callback` no Google Cloud e
   adicione `https://SEU_DOMINIO/api/auth/google/callback` às Redirect URLs do
   Supabase. Defina `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (os
   mesmos do Supabase, usados no refresh do Drive), `GOOGLE_TOKEN_ENCRYPTION_KEY`
   e `SUPABASE_SECRET_KEY`. O passo a passo está em
   [`docs/google-social-authentication.md`](docs/google-social-authentication.md).
7. Para armazenamento de vídeos, adicione `GOOGLE_OAUTH_SCOPES` (padrão
   `openid email profile https://www.googleapis.com/auth/drive.file`),
   `PLAYBACK_TOKEN_SECRET` e, opcionalmente, os limites de retry. As rotas
   legadas do Drive (`NEXT_PUBLIC_GOOGLE_DRIVE_REDIRECT_URI`) só são necessárias
   se você usar `/api/google-drive/oauth/*` diretamente. Veja
   [`docs/google-drive-video-storage.md`](docs/google-drive-video-storage.md).

> O runtime usa Supabase (Postgres, Auth e RLS). O schema e as políticas estão em `supabase/migrations`; o passo a passo da migração e o que ainda falta estão em [`docs/supabase-migration.md`](docs/supabase-migration.md).

---

## Estrutura

```
app/
  (auth)/                 login, cadastro, recuperação, convite
  (teacher)/              dashboard, alunos, planos, agenda, biblioteca, configurações
  (student)/portal/       dashboard, agenda, plano, biblioteca, histórico, perfil
  api/                    rotas REST por domínio
components/               UI, layout, autenticação, alunos, planos, agenda, biblioteca, portal
hooks/                    hooks reutilizáveis de dados e autenticação
lib/
  auth/                   sessão, token, senha
  db/                     repositório JSON, schema e seed de demonstração
  services/               regras de negócio por domínio
  validation/             schemas Zod
  api/                    clientes tipados das rotas
  supabase/ mux/ resend/  integrações externas
supabase/migrations/      schema PostgreSQL + RLS
tests/                    testes Vitest/fast-check
```

---

## Segurança e privacidade

- Toda rota de API valida sessão e propriedade antes de operar.
- Identificadores enviados pelo cliente nunca são confiados sem verificação de vínculo.
- Notas privadas são removidas nas respostas de aluno; a consulta SQL possui visão `student_enrollments` sem essa coluna.
- Reprodução de vídeo exige autorização por técnica, aula ou plano publicado e status `ready`.
- Senhas usam `scrypt` com salt; hashes nunca são retornados.
- Erros de login são genéricos para evitar enumeração de e-mails.
- Cookies de sessão são `httpOnly`, `SameSite=Lax` e `Secure` em produção.
- RLS no PostgreSQL é a camada de defesa em profundidade no ambiente Supabase.

---

## Testes

A suíte cobre **438 cenários**: validações, transições de status, criação de convites, busca/filtros, ciclo de vida de alunos, planos e publicação, biblioteca e arquivamento, conflitos de agenda, conclusão de aulas, geração por recorrência, autorização do portal, privacidade de notas, reprodução de vídeos, **Google OAuth** (unitários, componentes, propriedades 1–12 e integração), **Google Drive** (cliente, serviço, endpoints, componentes, propriedades 1–19, performance e migração) e **RLS executado de verdade** em PostgreSQL (PGlite).

```bash
npm test
npm run test:coverage   # 84,58% instruções / 81,32% branches
npm run test:rls        # somente a suíte de RLS
```

Consulte [`docs/TESTING.md`](docs/TESTING.md) para a organização das suítes, propriedades cobertas e cenários de RLS, [`docs/DEVIATIONS.md`](docs/DEVIATIONS.md) para decisões, simplificações e o escopo da verificação de RLS (schema base + políticas; Storage é validado por migração), [`docs/google-social-authentication.md`](docs/google-social-authentication.md) para o fluxo Google OAuth e [`docs/google-drive-video-storage.md`](docs/google-drive-video-storage.md) para armazenamento de vídeos, endpoints, erros e guias de uso.
