# Estratégia e resultados de testes

## Resumo

| Métrica | Resultado |
|---|---|
| Arquivos de teste | 19 |
| Cenários | **438** |
| Cobertura de instruções | **84,58%** (medida antes das features Google OAuth/Drive) |
| Cobertura de branches | **81,32%** (medida antes das features Google OAuth/Drive) |
| Cobertura de funções | 83,79% (medida antes das features Google OAuth/Drive) |
| Serviços (`lib/services`) | 92,24% (medida antes das features Google OAuth/Drive) |
| Autenticação (`lib/auth`) | 85,86% (medida antes das features Google OAuth/Drive) |
| Validação (`lib/validation`) | 99,58% (medida antes das features Google OAuth/Drive) |
| RLS | 42 cenários em PostgreSQL real (PGlite) |

Comandos:

```bash
npm test             # suíte completa
npm run test:coverage
npm run test:rls     # somente RLS
```

## Organização

| Arquivo | Foco |
|---|---|
| `tests/validation.test.ts` | E-mails, senhas, timezones, telefone, imagens, transições, períodos |
| `tests/enrollment-plan.test.ts` | Regras base de alunos e planos |
| `tests/library-lesson.test.ts` | Regras base de biblioteca, agenda e aulas |
| `tests/portal.test.ts` | Regras base do portal do aluno |
| `tests/auth-optional.test.ts` | 33 itens opcionais de autenticação/perfis, propriedades, endpoints e integração |
| `tests/enrollment-optional.test.ts` | 48 itens de alunos (propriedades, integração, limites, endpoints) |
| `tests/plan-optional.test.ts` | 31 itens de planos (propriedades, integrações, limites, endpoints) |
| `tests/library-optional.test.ts` | 41 itens de biblioteca (propriedades, upload, webhook, endpoints) |
| `tests/lessons-optional.test.ts` | 43 itens de agenda/aulas (propriedades, geração, conflitos, endpoints) |
| `tests/portal-optional.test.ts` | 44 itens do portal (agregações, privacidade, filtros, endpoints) |
| `tests/google-oauth.test.ts` | Google OAuth: criptografia, state/PKCE, cliente, serviço, rotas e integração |
| `tests/google-oauth-components.test.tsx` | Componentes Google (botão, status, diálogo, alerta e seção) em jsdom |
| `tests/google-oauth-properties.test.ts` | Propriedades 1–12 do Google OAuth com fast-check (100+ iterações) |
| `tests/google-drive-client.test.ts` | Cliente Google Drive v3: folders, upload, permissões, retry e circuit breaker |
| `tests/google-drive.test.ts` | Serviço, tokens, upload, playback, auditoria, chunks, migração e endpoints |
| `tests/google-drive-properties.test.ts` | Propriedades 1–19 do Google Drive com fast-check (100+ iterações) |
| `tests/google-drive-components.test.tsx` | Componentes de conexão, status, upload, progresso, erros e player |
| `tests/google-drive-performance.test.ts` | Listagem de 1000 vídeos <1s e URL de reprodução <200ms |
| `tests/rls.test.ts` | 42 cenários de RLS em PostgreSQL real (inclui Google OAuth, Drive e auditoria) |

Os arquivos `*-optional` mapeiam os itens marcados com `*` nos `tasks.md`; todos os checkboxes dos seis módulos estão concluídos.

## Propriedades (fast-check)

As suítes usam `fast-check` com geração aleatória e *shrinking* para:

- criação válida de conta, sessão e papéis;
- formato de e-mail, força de senha, timezone e campos obrigatórios;
- tokens de convite (entropia, formato, unicidade, expiração e reenvio);
- ativação de vínculo e associação de perfil;
- busca parcial/case-insensitive, filtros de status, paginação;
- transições válidas e inválidas de vínculo/aula/plano;
- atualização de perfil nas duas tabelas e timestamps UTC;
- criação/atualização/arquivamento/duplicação de planos;
- criação de técnica/módulo/vídeo, arquivamento em cascata, busca e reuso;
- criação de aula, conflitos, conclusão, imutabilidade e geração por recorrência;
- agregações, filtros e paginação do portal;
- isolamento entre professores e entre alunos.

## RLS com PostgreSQL real

`tests/rls.test.ts` usa **PGlite** (PostgreSQL 16 em WASM) e executa a migração `supabase/migrations/20261029_000001_initial_schema.sql` com stubs de:

- `auth.users`;
- `auth.uid()`, lendo `request.jwt.claim.sub`;
- papéis `authenticated` e `anon`;
- grants equivalentes ao Supabase.

Cenários verificados:

1. perfis: aluno vê só o próprio; professor vê alunos vinculados e não outro professor;
2. professores: aluno vê apenas professores com vínculo ativo;
3. vínculos: aluno vê só os próprios; professor vê só os próprios;
4. `private_notes`: coluna revogada de `authenticated`/`anon`, aluno recebe *permission denied*; professor lê via view `teacher_enrollments`;
5. planos: aluno vê somente publicado + liberado; rascunho/alheio invisível;
6. dias e vídeos de plano: visíveis apenas no plano publicado autorizado;
7. biblioteca: técnicas/módulos/vídeos apenas quando liberados; escrita negada ao aluno;
8. aulas: aluno vê apenas agendadas/concluídas dos próprios vínculos; canceladas/faltas e aulas alheias ocultas;
9. escrita: aluno não cria/edita planos, aulas, vínculos ou biblioteca;
10. professor não altera registros de outro professor;
11. `anon` não vê dados;
12. vídeos de aula respeitam o vínculo.

## Limitações

- A suíte RLS valida o schema base e as políticas PostgreSQL. A migração de Storage (`avatars`) é aplicada em produção, mas as políticas do bucket não são exercitadas em runtime local.
- Não há testes contra uma instância Supabase viva (Auth/Storage/realtime) nem E2E em navegador.
- Os clientes de integração (Supabase/Mux/Resend) têm cobertura baixa porque usam serviços externos opcionais; os caminhos de demonstração e as regras de negócio estão cobertos.
