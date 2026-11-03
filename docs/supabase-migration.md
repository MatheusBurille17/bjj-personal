# Migração para Supabase

Status da migração do runtime local (`.data/db.json`) para o Supabase.

## Concluído

- Projeto Supabase linkado por credenciais em `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (fallback `..._ANON_KEY`)
- Schema aplicado no banco remoto (`supabase/migrations`):
  - 22 tabelas, views `student_enrollments`/`teacher_enrollments`, funções
    `student_has_plan`, `get_invite` e `accept_invite`;
  - RLS habilitado em todas as tabelas;
  - bucket `avatars` criado;
  - verificação: `npm run verify:supabase`.
- Clientes tipados:
  - `lib/supabase/server.ts` (sessão do usuário, respeita RLS);
  - `lib/supabase/admin.ts` (secret key, ignora RLS — somente servidor);
  - `lib/supabase/errors.ts` (conversão de erros PostgREST → `ApiError`).
- Autenticação com Supabase Auth:
  - login, cadastro, recuperação/redefinição de senha, logout;
  - sessão em cookies via `@supabase/ssr`;
  - middleware renova a sessão e valida o usuário;
  - visão ativa (professor/aluno) em `bjj_active_role`.
- Serviços de domínio migrados para consultas assíncronas com RLS:
  - perfis e professores;
  - vínculos/alunos e convites;
  - biblioteca (técnicas → módulos → vídeos e permissões);
  - planos e dias do plano;
  - aulas, horários recorrentes, agenda e dashboard;
  - portal do aluno (dashboard, agenda, histórico, planos, biblioteca, playback).
- Rotas de API e páginas atualizadas para `await`.
- Procedimento de importação dos dados locais: `scripts/seed-supabase.mjs`.

## Pendente (próxima fase)

- **Google OAuth / Google Drive / vídeo**: os serviços em
  `lib/services/google-*.ts` e `lib/services/video-storage.service.ts` ainda
  usam o repositório local. Enquanto não forem migrados, essas funcionalidades
  não devem ser usadas em produção.
- **Testes**: a suíte atual (`tests/`) foi escrita para o repositório síncrono
  local. Ela está temporariamente fora do `tsconfig` e precisa ser reescrita
  para o runtime Supabase (integração real ou clientes mockados).
- **Storage de avatares**: por enquanto o avatar é salvo como data URL em
  `profiles.avatar_url`; o bucket `avatars` já existe para a migração para
  URLs assinadas.
- **Confirmação de e-mail**: sem `SUPABASE_SECRET_KEY`, o cadastro exige
  confirmação por e-mail. Com a secret key, o cadastro confirma
  automaticamente (`auth.admin.createUser`).

## Variáveis necessárias

```env
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...        # servidor: signup automático, webhooks, importação
AUTH_SECRET=<32+ caracteres>             # tokens de playback/estado OAuth
```

## Comandos

```bash
npm run verify:supabase       # confere tabelas e Auth
npm run seed:supabase         # importa .data/db.json (requer SUPABASE_DB_URL)
npx supabase db push --db-url "postgresql://postgres:SENHA@db.<ref>.supabase.co:5432/postgres"
```
