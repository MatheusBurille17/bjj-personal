# API — visão geral

Todas as rotas retornam JSON no formato:

```json
{ "data": {}, "error": null, "meta": { "timestamp": "..." } }
```

Erros:

```json
{ "data": null, "error": { "code": "VALIDATION_ERROR", "message": "Dados inválidos", "details": { "fields": {} } } }
```

Códigos HTTP: `400` validação, `401` autenticação, `403` autorização, `404` não encontrado, `409` conflito/regra de negócio, `500` erro inesperado, `503` serviço externo indisponível.

## Autenticação e perfis

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/signup` | Cria conta de professor e sessão |
| POST | `/api/auth/login` | Autentica e cria sessão |
| POST | `/api/auth/logout` | Encerra sessão |
| POST | `/api/auth/refresh` | Renova cookie de sessão |
| POST | `/api/auth/recover` | Solicita recuperação (resposta genérica) |
| POST | `/api/auth/reset-password` | Redefine senha com token |
| POST | `/api/auth/switch-role` | Alterna visão professor/aluno |
| GET/POST | `/api/auth/invite/[token]` | Valida/aceita convite |
| GET/PATCH | `/api/profiles/me` | Perfil autenticado |
| POST | `/api/storage/avatar/upload` | Upload de avatar (multipart `file`) |
| GET | `/api/teachers/[id]` | Perfil público do professor |

## Alunos (vínculos)

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/api/enrollments` | Lista (`search`, `status`, `page`, `pageSize`) / cria convite |
| GET/PATCH/DELETE | `/api/enrollments/[id]` | Detalhe / atualiza / exclui sem histórico |
| POST | `/api/enrollments/[id]/pause` | Pausa vínculo ativo |
| POST | `/api/enrollments/[id]/reactivate` | Reativa vínculo pausado |
| POST | `/api/enrollments/[id]/archive` | Arquiva preservando histórico |
| POST | `/api/enrollments/[id]/resend-invite` | Gera novo token de convite |

## Biblioteca

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/api/library/techniques` | Lista/cria técnica |
| PATCH | `/api/library/techniques/[id]` | Atualiza técnica |
| POST | `/api/library/techniques/reorder` | Reordena técnicas |
| POST | `/api/library/techniques/[id]/archive` | Arquiva em cascata |
| POST | `/api/library/techniques/[id]/unarchive` | Reativa técnica |
| GET | `/api/library/techniques/[id]/modules` | Módulos da técnica |
| POST | `/api/library/modules` | Cria módulo |
| PATCH | `/api/library/modules/[id]` | Atualiza módulo |
| POST | `/api/library/modules/[id]/move` | Move para outra técnica |
| POST | `/api/library/modules/[id]/archive` | Arquiva módulo e vídeos |
| GET | `/api/library/modules/[id]/videos` | Vídeos do módulo |
| POST | `/api/library/videos` | Cria metadados do vídeo |
| PATCH/DELETE | `/api/library/videos/[id]` | Atualiza/exclui sem referências |
| GET | `/api/library/videos/[id]/playback` | URL assinada (professor) |
| POST | `/api/library/videos/[id]/archive` | Arquiva vídeo |
| POST | `/api/library/videos/upload` | Direct upload Mux (ou demo) |
| POST | `/api/library/videos/webhook` | Webhook Mux |
| GET | `/api/library/search` | Busca vídeos (`search`, `page`, `pageSize`) |
| GET/POST | `/api/library/access` | Consulta/libera técnica para aluno |
| DELETE | `/api/library/access/[id]` | Revoga acesso |

## Planos mensais

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/api/plans` | Lista/cria plano |
| GET/PATCH/DELETE | `/api/plans/[id]` | Detalhe/atualiza/exclui |
| POST | `/api/plans/[id]/publish` | Publica rascunho |
| POST | `/api/plans/[id]/unpublish` | Volta para rascunho |
| POST | `/api/plans/[id]/archive` | Arquiva |
| POST | `/api/plans/[id]/unarchive` | Restaura como rascunho |
| POST | `/api/plans/[id]/duplicate` | Duplica como rascunho |
| GET/POST | `/api/plans/[id]/days` | Lista/cria dia planejado |
| PATCH/DELETE | `/api/plans/days/[dayId]` | Atualiza/remove dia |
| POST | `/api/plans/days/reorder` | Reordena dias |
| POST | `/api/plans/days/[dayId]/videos` | Associa vídeo ao dia |
| DELETE | `/api/plans/days/videos/[assocId]` | Remove associação |
| POST | `/api/plans/days/videos/reorder` | Reordena vídeos |
| GET/POST | `/api/plans/[id]/enrollments` | Lista/libera acesso |
| DELETE | `/api/plans/enrollments/[assocId]` | Revoga acesso |

## Agenda e aulas

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/api/lessons` | Lista/cria aula |
| GET/PATCH | `/api/lessons/[id]` | Detalhe/atualiza horário e notas |
| PATCH | `/api/lessons/[id]/status` | Conclui, cancela ou registra falta |
| GET/POST | `/api/lessons/[id]/videos` | Lista/adiciona vídeo |
| DELETE | `/api/lessons/[id]/videos/[videoId]` | Remove associação |
| PATCH | `/api/lessons/[id]/videos/reorder` | Reordena vídeos |
| POST | `/api/lessons/[id]/copy-videos-from-plan` | Copia vídeos do plano |
| POST | `/api/lessons/generate-from-slots` | Prévia/confirma geração (`confirm`) |
| GET/POST | `/api/weekly-slots` | Lista/cria recorrência |
| PATCH/DELETE | `/api/weekly-slots/[id]` | Atualiza/remove |
| POST | `/api/weekly-slots/[id]/pause` | Pausa |
| POST | `/api/weekly-slots/[id]/activate` | Reativa |
| GET | `/api/agenda/weekly?week_start=` | Agenda semanal |
| GET | `/api/agenda/daily?date=` | Agenda diária |
| GET | `/api/lessons/stats` | Estatísticas por aluno/período |
| GET | `/api/dashboard` | Indicadores do professor |

## Portal do aluno

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/student/dashboard` | Resumo, próxima aula, recentes |
| GET | `/api/student/agenda` | Aulas futuras/passadas |
| GET | `/api/student/lessons/upcoming` | Próximas aulas |
| GET | `/api/student/lessons/history` | Histórico paginado |
| GET | `/api/student/lessons/[id]` | Detalhe sem notas privadas |
| GET | `/api/student/plans` | Planos publicados ao aluno |
| GET | `/api/student/plans/[id]/days` | Dias do plano |
| GET | `/api/student/library/techniques` | Técnicas liberadas |
| GET | `/api/student/library/techniques/[id]/videos` | Módulos/vídeos autorizados |
| GET | `/api/student/videos/[id]/playback-url` | Reprodução autorizada |
| GET/PATCH | `/api/student/profile` | Perfil do aluno |
| GET | `/api/student/teachers` | Professores e próximas aulas |
| GET | `/api/student/statistics` | Totais e quebra por professor |

## Observações

- Rotas de professor exigem papel de professor; rotas `/api/student/*` exigem vínculo ativo de aluno.
- Identificadores de recursos são sempre verificados contra o professor/aluno autenticado.
- Consultas de listagem aceitam `page` (padrão 1) e `pageSize` (padrão 20, máximo 100).
- `status` pode ser repetido (`?status=active&status=paused`) ou separado por vírgulas.
- Rotas de demonstração: `GET /api/dev/outbox` e `POST /api/library/videos/[id]/status` (bloqueadas/quase irrelevantes em produção).
