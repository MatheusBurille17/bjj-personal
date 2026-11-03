# Planejamento do Aplicativo para Professores Particulares de Jiu-Jitsu

**Documento:** Visão do produto, requisitos funcionais e arquitetura inicial  
**Status:** Planejamento inicial  
**Versão:** 1.0  
**Data:** 25/10/2026

---

## 1. Resumo executivo

O produto será uma plataforma web responsiva para professores particulares de Jiu-Jitsu planejarem suas aulas, gerenciarem alunos, organizarem horários e disponibilizarem vídeos técnicos. Cada aluno terá uma área própria para consultar a agenda, acompanhar o histórico de aulas e assistir aos conteúdos liberados pelo professor.

A proposta é conectar quatro elementos que normalmente ficam separados: **alunos, planejamento mensal, agenda e biblioteca de técnicas**. O professor poderá montar um plano mensal, associar técnicas e vídeos aos dias planejados e usar esse planejamento como referência para aulas individuais. O aluno verá apenas as informações e os conteúdos aos quais tiver acesso.

A primeira versão deve priorizar o fluxo principal de acompanhamento das aulas, evitando funcionalidades que elevem a complexidade antes de validar o produto.

### 1.1 Problema que o produto resolve

Professores particulares podem acabar gerenciando alunos, horários, planos de treino e vídeos por meio de ferramentas diferentes, como agenda pessoal, mensagens, planilhas e pastas de vídeo. Isso torna mais difícil manter um histórico consistente e compartilhar com cada aluno apenas os materiais relevantes.

O aplicativo centraliza essas atividades e cria uma sequência clara:

1. O professor cadastra o aluno.
2. Define os horários fixos ou agenda aulas individuais.
3. Monta o planejamento mensal.
4. Organiza técnicas e vídeos na biblioteca.
5. Associa conteúdos aos dias planejados ou a aulas específicas.
6. Registra o que aconteceu em cada aula.
7. O aluno consulta sua agenda, seu histórico e os vídeos permitidos.

### 1.2 Proposta de valor

- **Para o professor:** menos trabalho administrativo e mais organização do acompanhamento técnico.
- **Para o aluno:** clareza sobre as próximas aulas, acesso fácil aos vídeos e registro do próprio treinamento.
- **Para o negócio:** uma base que pode evoluir para planos de assinatura, limites de alunos, vários instrutores ou uso por academias.

### 1.3 Princípios do produto

1. Simplicidade de uso durante a rotina de aulas.
2. Interface responsiva, utilizável no celular.
3. Separação clara entre planejamento e histórico real.
4. Conteúdos técnicos reutilizáveis, sem duplicar arquivos.
5. Dados isolados por professor e permissões explícitas por aluno.
6. Histórico preservado quando planos ou horários forem alterados.
7. Arquitetura simples no início, mas preparada para crescer.

---

## 2. Objetivos e limites do projeto

### 2.1 Objetivos da primeira versão

- Permitir que professores criem conta e configurem seu perfil.
- Cadastrar, editar, consultar e arquivar alunos.
- Organizar técnicas, módulos e vídeos.
- Criar planos mensais e definir o conteúdo previsto por dia da semana.
- Criar horários recorrentes por aluno e agendar aulas específicas.
- Mostrar uma agenda semanal e diária.
- Registrar aulas realizadas, cancelamentos e faltas.
- Associar um ou mais vídeos a dias planejados e a aulas específicas.
- Oferecer uma área do aluno com agenda, plano, histórico e biblioteca autorizada.
- Proteger as informações para que professores e alunos acessem apenas o que lhes é permitido.

### 2.2 Fora do escopo inicial

Os itens abaixo podem ser considerados depois que o núcleo estiver funcionando:

- Aplicativos nativos separados para Android e iOS.
- Pagamentos, cobrança recorrente e emissão de recibos.
- Chat interno entre professor e aluno.
- Marketplace para encontrar ou contratar professores.
- Aulas ao vivo ou videoconferência.
- Inteligência artificial para criar planos de aula automaticamente.
- Gamificação, rankings e medalhas.
- Controle financeiro do professor.
- Gestão completa de academias com turmas coletivas, folha de pagamento e múltiplas unidades.
- Integrações com calendários externos.
- Questionários, provas e sistema de avaliações com notas.

Esses itens não são proibidos pela arquitetura; apenas não são necessários para validar a primeira versão.

---

## 3. Tipos de usuário e permissões

### 3.1 Professor

O professor é o principal usuário administrativo da plataforma. Ele pode:

- Gerenciar seu perfil.
- Cadastrar e administrar seus próprios alunos.
- Criar e administrar planos mensais.
- Criar técnicas, módulos e vídeos.
- Configurar acesso dos alunos à biblioteca.
- Criar horários recorrentes e aulas específicas.
- Associar planos, técnicas e vídeos às aulas.
- Registrar presença, conclusão, cancelamento ou falta.
- Consultar o histórico e os indicadores dos próprios alunos.

O professor não pode acessar os dados privados de outros professores.

### 3.2 Aluno

O aluno utiliza a plataforma para acompanhar o treinamento. Ele pode:

- Consultar e editar os campos pessoais permitidos.
- Visualizar os professores aos quais está vinculado.
- Consultar sua agenda e suas aulas futuras.
- Consultar aulas passadas e seus respectivos detalhes.
- Ver o plano de treinamento publicado para ele.
- Assistir aos vídeos associados às suas aulas, desde que autorizados.
- Navegar pela biblioteca de técnicas liberadas pelo professor.
- Consultar o histórico das aulas realizadas.

O aluno não pode editar planos, alterar aulas, gerenciar vídeos ou consultar dados de outros alunos.

### 3.3 Administrador da plataforma — futuro

Um perfil administrativo global poderá ser adicionado se o produto tiver operação comercial própria. Em uma fase posterior, poderá gerenciar contas, suporte, limites de assinatura e configurações da plataforma. Esse perfil não deve ser confundido com o professor, que administra apenas seu próprio espaço.

### 3.4 Um aluno com mais de um professor

A arquitetura deve permitir que uma pessoa tenha uma única conta de aluno e vínculos independentes com diferentes professores. Cada vínculo mantém seus próprios horários, observações, permissões e histórico de acompanhamento. A informação de um professor não deve ser compartilhada automaticamente com outro.

---

## 4. Navegação e estrutura das áreas

### 4.1 Menu do professor

1. Dashboard
2. Agenda
3. Alunos
4. Planos de aula
5. Biblioteca de técnicas
6. Configurações

Atalhos para ações comuns devem estar disponíveis no dashboard e nas páginas relacionadas, como **Cadastrar aluno**, **Criar plano**, **Adicionar vídeo** e **Agendar aula**.

### 4.2 Menu do aluno

1. Início
2. Minha agenda
3. Meu plano de treinamento
4. Biblioteca
5. Meu histórico
6. Meu perfil

Se houver mais de um professor, a interface deverá permitir identificar a qual professor pertence cada plano, aula ou biblioteca.

---

## 5. Funcionalidades do professor

### 5.1 Dashboard

O dashboard deve mostrar informações que ajudem o professor a entender rapidamente sua rotina.

**Indicadores propostos:**

- Quantidade de alunos ativos.
- Quantidade de aulas agendadas para o dia.
- Próximas aulas.
- Aulas realizadas no mês.
- Aulas canceladas e faltas no período, se disponíveis.
- Horários livres, caso o professor cadastre sua disponibilidade.

**Ações rápidas:**

- Cadastrar aluno.
- Criar plano mensal.
- Criar ou editar uma aula.
- Adicionar vídeo à biblioteca.

**Regras:**

- Todos os indicadores devem considerar somente os dados do professor autenticado.
- Aulas canceladas não devem ser contabilizadas como aulas realizadas.
- A contagem deve usar os estados registrados das aulas, não estimativas baseadas apenas na agenda.

### 5.2 Gestão de alunos

O professor poderá cadastrar, consultar, editar e arquivar alunos.

**Campos mínimos sugeridos:**

- Nome completo.
- E-mail, caso exista ou seja necessário para o convite.
- Telefone, opcional.
- Data de início do vínculo.
- Situação: convite pendente, ativo, pausado ou arquivado.
- Observações privadas do professor, opcionais.

**Página de listagem:**

- Mostrar nome, situação e próxima aula.
- Permitir pesquisa por nome.
- Permitir filtro por situação.
- Mostrar a quantidade de aulas realizadas quando útil.

**Ficha individual do aluno:**

- Resumo.
- Agenda.
- Plano de treinamento.
- Vídeos e técnicas liberados.
- Histórico de aulas.
- Dados do vínculo.

**Regras:**

- Arquivar um aluno deve preservar seu histórico.
- Um aluno arquivado não deve aparecer como ativo nos indicadores.
- O professor não deve conseguir vincular uma conta de aluno sem autorização ou verificação adequada do convite.
- Informações privadas do professor não devem ser expostas na área do aluno.

### 5.3 Planos mensais de aula

O plano mensal representa o **planejamento pedagógico**, ou seja, o conteúdo que o professor pretende trabalhar durante determinado período.

**Campos do plano:**

- Título.
- Mês e ano ou período de início e fim.
- Descrição e objetivo geral.
- Estado: rascunho, publicado ou arquivado.
- Data de criação e última atualização.

**Cada plano pode conter vários dias planejados.** Para cada dia, o professor pode definir:

- Dia da semana.
- Tema ou foco técnico.
- Objetivo da aula.
- Técnica ou técnicas relacionadas.
- Observações e instruções.
- Ordem de execução dos conteúdos.
- Um ou mais vídeos recomendados.

**Ações disponíveis:**

- Criar plano.
- Editar plano.
- Duplicar plano como ponto de partida para outro mês.
- Publicar ou retirar de publicação.
- Arquivar plano.
- Adicionar, editar, ordenar e remover dias planejados.
- Vincular e desvincular vídeos.

**Regras:**

- Um plano em rascunho é visível apenas ao professor responsável.
- Um plano publicado só deve aparecer para alunos autorizados.
- Editar um plano não deve alterar silenciosamente o histórico das aulas já concluídas.
- A publicação precisa ter comportamento definido quando o plano é usado por vários alunos: pode ser publicado para todos os alunos escolhidos ou para um vínculo específico.
- O plano mensal não deve ser confundido com as aulas efetivamente agendadas.

### 5.4 Biblioteca de técnicas

A biblioteca organiza o acervo técnico do professor e permite reutilizar os mesmos vídeos em diferentes planos e aulas.

**Hierarquia inicial recomendada:**

- Técnica ou categoria.
- Módulo.
- Vídeos.

Exemplo de organização:

- Passagem de guarda
  - Fundamentos
  - Preparação e entradas
  - Execução
  - Controle e estabilização
  - Erros comuns
  - Progressões e exercícios

A hierarquia é ilustrativa. O professor deve poder adaptar categorias e módulos à própria metodologia.

**Campos da técnica:**

- Nome.
- Descrição.
- Categoria opcional.
- Ordem de exibição.
- Situação ativa ou arquivada.

**Campos do módulo:**

- Técnica ou categoria pai.
- Nome.
- Descrição opcional.
- Ordem de exibição.

**Campos do vídeo:**

- Título.
- Descrição.
- Identificador do vídeo no provedor de hospedagem.
- Miniatura, se disponível.
- Duração, se disponível.
- Módulo relacionado.
- Situação: processamento, disponível, erro ou arquivado.
- Data de criação.

**Ações disponíveis:**

- Criar, editar e arquivar técnicas.
- Criar, editar e reordenar módulos.
- Enviar vídeo ou cadastrar um vídeo conforme a estratégia de hospedagem adotada.
- Editar título e descrição.
- Associar vídeo a um módulo.
- Pesquisar e filtrar o acervo.
- Configurar quais alunos podem acessar o conteúdo.

**Regras:**

- O banco guarda metadados e o identificador do vídeo; o arquivo de vídeo fica em serviço de mídia separado.
- A remoção de um vídeo que já esteja associado a aulas anteriores deve ser tratada com cuidado. Preferir arquivamento ou impedir a exclusão enquanto houver referências históricas.
- O mesmo vídeo pode ser utilizado em vários planos e aulas.
- O acesso à biblioteca deve ser configurado por professor e aluno, ou por uma regra de acesso bem definida.

### 5.5 Agenda

A agenda deve oferecer, no mínimo, visualização semanal e diária. Uma visualização mensal pode ser adicionada se for útil, sem comprometer a experiência principal.

**Informações mostradas em cada aula:**

- Horário de início e fim.
- Nome do aluno.
- Situação da aula.
- Plano ou tema relacionado.
- Indicação de que existem vídeos anexados.

**Ações:**

- Agendar uma aula.
- Editar data e horário.
- Reagendar.
- Cancelar.
- Abrir detalhes.
- Marcar como realizada.
- Registrar falta.
- Adicionar ou remover vídeos.
- Inserir observações sobre a sessão.

**Estados recomendados para uma aula:**

- `scheduled` — agendada.
- `completed` — realizada.
- `cancelled` — cancelada.
- `no_show` — aluno não compareceu.

Se necessário, pode existir um estado `rescheduled` para exibição ou auditoria, mas a modelagem precisa deixar claro se ele representa uma aula antiga cancelada e uma nova ocorrência criada. Não se deve reutilizar ou sobrescrever o registro histórico de maneira ambígua.

**Regras da agenda:**

- O professor deve poder alterar uma ocorrência sem alterar toda a recorrência semanal.
- Conflitos de horário devem ser detectados antes de salvar, conforme as regras de disponibilidade definidas.
- A aula deve ter fuso horário consistente.
- Alterações em aulas já concluídas devem ser limitadas e registradas.
- A contagem de aulas realizadas considera apenas aulas com estado `completed`.
- Cancelamentos e faltas não contam como aulas concluídas, a menos que uma regra comercial futura determine expressamente outra coisa.

### 5.6 Horários recorrentes

O horário recorrente representa a programação padrão do aluno, por exemplo, toda terça-feira às 18h.

**Campos sugeridos:**

- Vínculo do aluno com o professor.
- Dia da semana.
- Horário de início e fim.
- Data de início.
- Data de encerramento, opcional.
- Situação ativa ou pausada.
- Fuso horário, se necessário para o modelo de implantação.

Os horários recorrentes são uma regra para gerar ou sugerir aulas, não o registro de cada aula realizada. As ocorrências concretas são armazenadas separadamente.

**Decisão de implementação:** para o MVP, pode ser suficiente cadastrar a recorrência e gerar as aulas futuras por um período limitado, permitindo que o professor confira antes de confirmar. A geração automática de todas as ocorrências futuras precisa tratar duplicações, mudanças de horário e exceções.

### 5.7 Associação de vídeos às aulas

O professor poderá adicionar zero, um ou vários vídeos ao conteúdo de uma aula.

Existem duas origens possíveis:

1. Vídeos sugeridos pelo dia do plano mensal.
2. Vídeos adicionados especificamente àquela aula.

A interface deve deixar claro quais vídeos vieram do plano e quais foram personalizados para a sessão. O professor deve poder personalizar a aula sem modificar o plano original para todos os alunos.

Quando uma aula for concluída, os vídeos usados naquela sessão devem continuar identificáveis no histórico. Editar o plano futuramente não deve apagar essas associações históricas.

---

## 6. Funcionalidades do aluno

### 6.1 Dashboard

A tela inicial do aluno deve responder rapidamente a três perguntas: quando será minha próxima aula, o que já treinei e quais conteúdos estão disponíveis?

**Elementos propostos:**

- Próxima aula, com data e horário.
- Total de aulas realizadas.
- Últimas aulas concluídas.
- Próximos compromissos.
- Vídeos associados à próxima aula.
- Atalho para a biblioteca liberada.

Os indicadores devem refletir os registros reais do aluno e não apenas os horários recorrentes.

### 6.2 Minha agenda

O aluno poderá consultar suas aulas futuras e passadas. A interface deve distinguir claramente aulas agendadas, realizadas, canceladas e faltas.

No detalhe de uma aula, quando autorizado, o aluno poderá visualizar:

- Data e horário.
- Tema ou objetivo.
- Plano relacionado.
- Vídeos associados.
- Observações compartilhadas pelo professor.

Observações privadas do professor nunca devem ser exibidas.

### 6.3 Meu plano de treinamento

O aluno poderá consultar os planos que o professor publicou para ele.

A tela pode separar:

- Conteúdos já trabalhados.
- Conteúdos previstos para o futuro.
- Conteúdos de cada semana ou dia.
- Vídeos associados a cada conteúdo.

Um conteúdo planejado não deve ser apresentado como uma aula realizada até existir um registro de aula concluída.

### 6.4 Biblioteca do aluno

O aluno poderá pesquisar e assistir a vídeos a que tem direito de acesso.

A biblioteca deve organizar os vídeos por técnica e módulo, respeitando as permissões definidas pelo professor. A disponibilidade na biblioteca geral e a associação de um vídeo a uma aula podem ser permissões distintas.

**Exemplo de regras de acesso possíveis:**

- Acesso somente quando o vídeo está vinculado a uma aula do aluno.
- Acesso à técnica inteira quando ela for liberada.
- Acesso a módulos específicos.
- Acesso a uma seleção individual de vídeos.

Para o MVP, recomenda-se escolher uma regra primária simples e aplicá-la de maneira consistente. Uma boa opção é permitir a visualização dos vídeos anexados às aulas do aluno e das técnicas explicitamente liberadas pelo professor.

### 6.5 Perfil do aluno

O aluno poderá visualizar e editar somente os campos pessoais permitidos. Dados de vínculo, observações internas e informações administrativas do professor devem permanecer protegidos.

---

## 7. Fluxos principais do produto

### 7.1 Entrada de um novo professor

1. O professor cria uma conta.
2. Confirma seu e-mail, caso esse requisito esteja habilitado.
3. Completa os dados básicos do perfil.
4. Acessa o dashboard vazio com orientações iniciais.
5. Cadastra seu primeiro aluno ou envia um convite.
6. Cria um plano ou registra seus horários.
7. Adiciona técnicas e vídeos à biblioteca.

### 7.2 Cadastro e convite de aluno

1. O professor informa os dados básicos do aluno.
2. O sistema cria um vínculo com estado de convite pendente ou ativo, conforme o método de acesso escolhido.
3. Se houver convite por e-mail, o aluno recebe um link seguro para criar ou associar sua conta.
4. Depois da confirmação, o vínculo passa a estar ativo.
5. O aluno passa a visualizar os dados liberados pelo professor.

O cadastro do vínculo não deve exigir que o aluno já possua uma conta. Isso permite que o professor organize sua carteira antes de todos os alunos entrarem na plataforma.

### 7.3 Criar plano mensal

1. O professor cria um plano para determinado mês ou período.
2. Define título, objetivos e descrição.
3. Adiciona os dias planejados.
4. Define tema, técnica e observações de cada dia.
5. Seleciona um ou mais vídeos da biblioteca.
6. Salva como rascunho.
7. Revisa o plano e o publica para o público autorizado.

### 7.4 Agendar aula individual

1. O professor abre a agenda ou a ficha do aluno.
2. Seleciona data, horário e duração.
3. Opcionalmente associa o dia do plano mensal correspondente.
4. Revisa os vídeos sugeridos pelo planejamento.
5. Adiciona ou remove vídeos específicos.
6. Salva a aula.
7. A aula aparece na agenda do professor e do aluno, conforme as permissões.

### 7.5 Realizar e concluir uma aula

1. O professor abre os detalhes da aula.
2. Confere o aluno, a data e os conteúdos previstos.
3. Ajusta os vídeos utilizados, se necessário.
4. Registra observações compartilháveis e, se necessário, notas privadas.
5. Marca a aula como realizada.
6. O sistema grava a conclusão e atualiza os indicadores.
7. A aula passa a aparecer no histórico do aluno.

### 7.6 Acesso a um vídeo

1. O aluno abre a biblioteca ou o detalhe de uma aula.
2. O servidor verifica a sessão, o vínculo e a permissão do conteúdo.
3. Se autorizado, a aplicação obtém uma URL de reprodução protegida ou um token temporário.
4. O vídeo é exibido.
5. Se não autorizado, o sistema não fornece o endereço protegido do vídeo.

---

## 8. Modelo conceitual de dados

O modelo abaixo representa a estrutura inicial. Os nomes são sugestões e podem ser ajustados durante a implementação.

### 8.1 `profiles`

Representa a conta autenticada e os dados básicos compartilhados pelo usuário.

Campos possíveis:

- `id` — UUID, relacionado ao usuário de autenticação.
- `full_name` — nome completo.
- `email` — e-mail, conforme a estratégia de autenticação.
- `avatar_url` — imagem de perfil, opcional.
- `created_at` — criação.
- `updated_at` — atualização.

Não se deve depender apenas de um campo de perfil para distinguir todas as permissões. A autorização deve considerar as relações e os papéis definidos no sistema.

### 8.2 `teachers`

Contém configurações próprias do professor.

Campos possíveis:

- `id` — UUID.
- `profile_id` — perfil proprietário.
- `display_name` — nome público do professor.
- `timezone` — fuso horário.
- `created_at`.
- `updated_at`.

### 8.3 `enrollments`

Representa o vínculo entre professor e aluno. Essa tabela é central para a separação dos dados.

Campos possíveis:

- `id` — UUID.
- `teacher_id` — professor responsável.
- `student_profile_id` — perfil do aluno, opcional enquanto o convite estiver pendente.
- `student_name` — nome usado antes da associação de uma conta.
- `student_email` — e-mail, se utilizado para convite.
- `student_phone` — telefone opcional.
- `status` — pending, active, paused ou archived.
- `started_at` — início do vínculo.
- `archived_at` — data de arquivamento, se aplicável.
- `private_notes` — observações internas, se necessárias.
- `created_at`.
- `updated_at`.

**Importante:** uma conta de aluno pode ter mais de um vínculo. Observações privadas e status pertencem ao vínculo, não necessariamente à conta global.

### 8.4 `monthly_plans`

Campos possíveis:

- `id`.
- `teacher_id`.
- `title`.
- `description`.
- `period_start`.
- `period_end`.
- `status` — draft, published ou archived.
- `published_at`.
- `created_at`.
- `updated_at`.

Se o plano for publicado de maneira diferente para alunos diferentes, será necessária uma relação explícita de publicação ou atribuição, como `plan_enrollments`.

### 8.5 `plan_days`

Representa cada item de planejamento de um plano mensal.

Campos possíveis:

- `id`.
- `monthly_plan_id`.
- `weekday` — dia da semana, se o plano for baseado em recorrência semanal.
- `planned_date` — data específica, caso o plano use datas reais.
- `title`.
- `objective`.
- `notes`.
- `sort_order`.
- `created_at`.
- `updated_at`.

**Decisão necessária:** o produto deve escolher se o planejamento será estruturado principalmente por dia da semana (por exemplo, todas as quartas) ou por data concreta (por exemplo, 4 de novembro). Pode suportar os dois, mas isso aumenta a complexidade. A interface precisa evitar ambiguidade entre um modelo e outro.

### 8.6 `techniques`

Campos possíveis:

- `id`.
- `teacher_id`.
- `name`.
- `description`.
- `category` ou `parent_technique_id`, conforme a hierarquia escolhida.
- `sort_order`.
- `status` — active ou archived.
- `created_at`.
- `updated_at`.

### 8.7 `modules`

Campos possíveis:

- `id`.
- `technique_id`.
- `name`.
- `description`.
- `sort_order`.
- `status`.
- `created_at`.
- `updated_at`.

Se a biblioteca exigir mais de um nível de organização, é possível adotar categorias e subcategorias. No MVP, recomenda-se manter uma hierarquia simples e previsível.

### 8.8 `videos`

Campos possíveis:

- `id`.
- `teacher_id`.
- `module_id`.
- `title`.
- `description`.
- `provider` — provedor de mídia.
- `provider_video_id` — identificador retornado pelo provedor.
- `thumbnail_url` — opcional.
- `duration_seconds` — opcional.
- `status` — uploading, processing, ready, error ou archived.
- `created_at`.
- `updated_at`.

Evitar colocar arquivos de vídeo diretamente em colunas do banco. O banco deve armazenar referências e metadados.

### 8.9 `plan_day_videos`

Tabela de associação entre os dias planejados e os vídeos.

Campos possíveis:

- `id`.
- `plan_day_id`.
- `video_id`.
- `sort_order`.
- `created_at`.

A relação muitos-para-muitos permite que um dia tenha vários vídeos e que um vídeo seja reutilizado em vários dias.

### 8.10 `weekly_slots`

Representa horários recorrentes.

Campos possíveis:

- `id`.
- `teacher_id`.
- `enrollment_id`.
- `weekday`.
- `start_time`.
- `end_time`.
- `valid_from`.
- `valid_until` — opcional.
- `status` — active ou paused.
- `created_at`.
- `updated_at`.

### 8.11 `lessons`

Representa uma ocorrência concreta de aula.

Campos possíveis:

- `id`.
- `teacher_id`.
- `enrollment_id`.
- `plan_day_id` — opcional, como referência ao planejamento.
- `starts_at`.
- `ends_at`.
- `status` — scheduled, completed, cancelled ou no_show.
- `completed_at` — opcional.
- `shared_notes` — observações visíveis ao aluno.
- `private_notes` — observações exclusivas do professor, se necessárias.
- `created_at`.
- `updated_at`.

A aula deve manter informações suficientes para preservar o histórico mesmo que o plano original seja editado. Isso pode exigir armazenar uma cópia do título/objetivo utilizado na sessão ou manter versões imutáveis do planejamento.

### 8.12 `lesson_videos`

Tabela de associação entre uma aula e seus vídeos.

Campos possíveis:

- `id`.
- `lesson_id`.
- `video_id`.
- `source` — plan ou manual, para identificar como o vídeo foi incluído.
- `sort_order`.
- `created_at`.

Essa associação registra os vídeos da sessão sem copiar os arquivos. Para preservar integralmente o histórico, deve-se decidir se a associação guarda também um snapshot do título do vídeo usado na época.

### 8.13 `student_technique_access`

Define liberações específicas de biblioteca.

Campos possíveis:

- `id`.
- `teacher_id`.
- `enrollment_id`.
- `technique_id` ou `module_id` ou `video_id`, conforme o escopo de permissão escolhido.
- `granted_at`.
- `revoked_at` — opcional.

Não é obrigatório manter uma única tabela capaz de autorizar três tipos de objeto. A modelagem final pode usar tabelas separadas ou uma regra de acesso mais simples, desde que fique clara, íntegra e testável.

### 8.14 Tabelas futuras

- `notifications` — lembretes e notificações internas.
- `audit_logs` — histórico de alterações relevantes.
- `subscriptions` — plano comercial do professor.
- `teacher_limits` — limites aplicáveis ao professor.
- `plan_enrollments` — alunos que podem visualizar um plano específico.
- `video_upload_sessions` — controle de uploads, caso o provedor e o fluxo exijam.

---

## 9. Regras de negócio consolidadas

1. Todo registro administrativo deve estar vinculado ao professor responsável ou a um vínculo que identifique claramente esse proprietário.
2. O professor só pode gerenciar seus próprios alunos, planos, técnicas, vídeos e aulas.
3. O aluno só pode consultar seus vínculos, suas aulas e os conteúdos aos quais tem acesso.
4. Um horário recorrente não é a mesma coisa que uma aula concreta.
5. O plano mensal representa intenção de ensino; a aula registra o evento real.
6. Somente aulas concluídas contam como realizadas.
7. Cancelamentos e faltas não são aulas concluídas.
8. Arquivar alunos, planos, técnicas e vídeos deve preservar o histórico sempre que houver registros relacionados.
9. A alteração de um plano não pode modificar silenciosamente o conteúdo histórico de uma aula já concluída.
10. Vídeos devem poder ser reutilizados em diferentes planos e aulas.
11. A disponibilidade de um vídeo na biblioteca e a associação a uma aula são relações distintas, caso as regras de produto as tratem separadamente.
12. Um plano em rascunho não deve ser exposto ao aluno.
13. Observações internas não podem aparecer na área do aluno.
14. A autorização de acesso deve ser validada no servidor e nas políticas do banco, não somente pela interface.
15. A remoção de uma conta ou vínculo deve respeitar o histórico, a privacidade e as regras de retenção definidas para o produto.
16. Toda operação com data e hora deve utilizar uma estratégia consistente de fuso horário.
17. A geração de aulas a partir de recorrências não deve produzir duplicatas.
18. Quando uma aula for reagendada, a ocorrência original e a nova ocorrência devem ter um relacionamento ou histórico claro.
19. O sistema deve impedir referências a vídeos, planos ou alunos que pertençam a outro professor.
20. Se houver limite de alunos por assinatura, esse limite deve ser configurável e validado no servidor.

---

## 10. Segurança e privacidade

### 10.1 Autenticação

- Usar um provedor de autenticação consolidado.
- Implementar recuperação de senha e encerramento de sessão.
- Exigir confirmação de e-mail quando apropriado.
- Validar convites e evitar que uma pessoa associe indevidamente uma conta a um vínculo de aluno.

### 10.2 Autorização

- Definir políticas de acesso por professor, aluno e vínculo.
- Aplicar autorização em todas as operações de leitura e escrita.
- Configurar Row Level Security nas tabelas que estiverem expostas ao cliente, se Supabase for utilizado.
- Não confiar em identificadores enviados pelo cliente sem verificar o vínculo e a propriedade dos registros.
- Não usar chaves administrativas no frontend.

### 10.3 Vídeos e uploads

- Preferir provedor de vídeo que ofereça upload e reprodução com controle de acesso.
- Emitir URLs temporárias ou tokens de reprodução apenas após verificar a autorização.
- Limitar tipos e tamanhos de arquivos aceitos.
- Validar o resultado do processamento do vídeo antes de marcá-lo como disponível.
- Não considerar um link difícil de adivinhar como mecanismo suficiente de segurança.

### 10.4 Privacidade dos alunos

- Coletar somente dados necessários ao funcionamento do produto.
- Separar observações privadas das observações compartilhadas com o aluno.
- Definir procedimentos para correção, exportação e exclusão de dados quando aplicáveis.
- Documentar o tratamento de dados pessoais e adequar o produto à legislação aplicável, incluindo a LGPD.

### 10.5 Auditoria e integridade

Registrar pelo menos alterações críticas, como mudança de estado de aula, alterações de permissões e ações administrativas relevantes. As regras de auditoria podem ser expandidas conforme a plataforma crescer.

---

## 11. Requisitos não funcionais

### 11.1 Usabilidade

- Interface em português brasileiro.
- Design responsivo para celular, tablet e computador.
- Formulários com validação e mensagens de erro claras.
- Navegação direta para as tarefas mais frequentes.
- Estados vazios com instruções para o primeiro uso.
- Confirmação antes de ações destrutivas ou irreversíveis.

### 11.2 Desempenho

- Paginar ou limitar listas grandes.
- Evitar carregar todos os vídeos e aulas de uma só vez.
- Usar índices para consultas por professor, aluno, data e situação.
- Carregar miniaturas e metadados antes de iniciar vídeos.
- Evitar consultas repetidas desnecessárias no dashboard.

### 11.3 Confiabilidade

- Tratar erros de rede e falhas do provedor de mídia.
- Evitar duplicidade na geração de aulas recorrentes.
- Preservar as associações históricas.
- Ter ambientes separados de desenvolvimento e produção.
- Manter backups conforme os recursos e as políticas do banco adotado.

### 11.4 Manutenibilidade

- Separar interface, regras de negócio e acesso a dados.
- Organizar o código por módulos de domínio.
- Validar entradas com esquemas reutilizáveis.
- Centralizar estados permitidos e regras críticas.
- Automatizar testes de autorização e fluxos principais.
- Registrar decisões arquiteturais importantes.

### 11.5 Acessibilidade

- Navegação por teclado nos fluxos essenciais.
- Rótulos claros nos campos.
- Contraste adequado.
- Estados de erro que não dependam apenas de cor.
- Controles de vídeo utilizáveis em telas pequenas.

---

## 12. Arquitetura técnica recomendada

### 12.1 Abordagem geral

Começar como um **monólito modular**, com uma aplicação web e serviços externos bem definidos. Essa abordagem reduz a complexidade de implantação e manutenção, sem impedir que componentes sejam separados no futuro se houver necessidade real.

### 12.2 Stack inicial sugerida

- **Frontend e aplicação web:** Next.js com TypeScript.
- **Banco de dados:** PostgreSQL.
- **Autenticação:** Supabase Auth ou solução equivalente.
- **Acesso e políticas de dados:** consultas validadas no servidor e Row Level Security onde aplicável.
- **Vídeos:** serviço especializado, como Cloudflare Stream, ou alternativa equivalente avaliada antes da implementação.
- **Deploy:** Vercel ou plataforma equivalente compatível com a aplicação.
- **Validação:** biblioteca de esquemas de validação para formulários e operações do servidor.
- **Testes:** testes unitários das regras, testes de integração de dados e testes de ponta a ponta dos fluxos principais.

A escolha final de serviços deve considerar preço, limites de uso, custos de reprodução de vídeo, privacidade, facilidade de exportação dos dados e necessidades do público.

### 12.3 Módulos de software

Sugestão de organização por domínio:

- `auth` — sessão, perfis e convites.
- `teachers` — configurações do professor.
- `students` — vínculos, cadastro e perfil do aluno.
- `plans` — planos mensais e dias planejados.
- `techniques` — técnicas e módulos.
- `videos` — metadados, upload e acesso à mídia.
- `schedule` — horários recorrentes e ocorrências.
- `lessons` — detalhes, conclusão e histórico.
- `dashboard` — indicadores agregados.
- `notifications` — lembretes futuros.
- `billing` — futura camada comercial.

O objetivo não é criar um serviço separado para cada módulo. Os módulos podem permanecer no mesmo repositório e na mesma aplicação, com responsabilidades bem definidas.

### 12.4 Fluxo de reprodução segura

1. O aluno solicita a reprodução de um vídeo.
2. O servidor valida a sessão.
3. O sistema verifica o vínculo com o professor.
4. O sistema verifica se o vídeo está liberado pela biblioteca ou associado a uma aula acessível.
5. Se estiver autorizado, o servidor gera ou solicita ao provedor um token temporário de reprodução.
6. O cliente recebe apenas os dados necessários para iniciar o vídeo.
7. Caso a autorização falhe, nenhum token ou endereço protegido é disponibilizado.

---

## 13. Plano de desenvolvimento do MVP

### Fase 0 — Definição e protótipo

**Objetivo:** reduzir ambiguidades antes de implementar.

Entregas:

- Definição final dos fluxos de professor e aluno.
- Wireframes das telas principais.
- Definição de regras de publicação dos planos.
- Decisão sobre planejamento por dia da semana, por data ou ambos.
- Decisão sobre acesso à biblioteca.
- Modelo de dados revisado.
- Critérios de aceitação por funcionalidade.

### Fase 1 — Fundação e autenticação

**Entregas:**

- Projeto configurado.
- Ambientes de desenvolvimento e produção.
- Cadastro, login e recuperação de senha.
- Perfil do usuário.
- Perfil do professor.
- Estrutura de autorização e políticas de banco.
- Layout base responsivo.

**Critério de saída:** usuários conseguem entrar e cada tipo de acesso respeita as permissões.

### Fase 2 — Gestão de alunos

**Entregas:**

- Cadastro e edição.
- Pesquisa e listagem.
- Arquivamento.
- Vínculo com conta do aluno.
- Convite ou fluxo de ativação.
- Ficha individual inicial.

**Critério de saída:** o professor consegue administrar os próprios alunos e não acessa dados de outros professores.

### Fase 3 — Agenda e aulas

**Entregas:**

- Agenda semanal e diária.
- Agendamento manual.
- Edição e reagendamento.
- Cancelamento e registro de falta.
- Conclusão de aula.
- Horários recorrentes, se incluídos no escopo de lançamento.
- Histórico de aulas.

**Critério de saída:** o professor consegue agendar e concluir aulas e o histórico reflete os estados corretos.

### Fase 4 — Planos mensais

**Entregas:**

- CRUD de planos.
- Dias planejados.
- Temas, objetivos e observações.
- Rascunho e publicação.
- Duplicação de plano, se prioritária.
- Associação de planos aos alunos ou vínculos conforme a regra escolhida.

**Critério de saída:** o professor consegue montar e publicar um plano sem confundi-lo com as aulas realizadas.

### Fase 5 — Técnicas, módulos e vídeos

**Entregas:**

- CRUD de técnicas e módulos.
- Fluxo de envio ou cadastro de vídeos.
- Processamento e estado do vídeo.
- Associação entre vídeos e módulos.
- Pesquisa e ordenação.
- Permissões de acesso.

**Critério de saída:** o professor consegue manter a biblioteca e os vídeos só podem ser reproduzidos por usuários autorizados.

### Fase 6 — Integração com o aluno

**Entregas:**

- Dashboard do aluno.
- Agenda do aluno.
- Histórico.
- Planos publicados.
- Vídeos associados às aulas.
- Biblioteca autorizada.
- Perfil do aluno.

**Critério de saída:** o aluno consegue acompanhar seu treinamento sem acessar recursos administrativos ou dados alheios.

### Fase 7 — Testes, ajustes e lançamento controlado

**Entregas:**

- Testes de autorização.
- Testes de fluxos críticos.
- Ajustes de usabilidade mobile.
- Verificação de recuperação de senha e convites.
- Revisão de logs, backups e tratamento de erros.
- Teste com um pequeno grupo de professores e alunos.

**Critério de saída:** os fluxos essenciais funcionam de ponta a ponta e os problemas críticos de acesso e integridade foram resolvidos.

---

## 14. Critérios de aceitação do MVP

### 14.1 Cadastro e permissões

- [ ] Um professor consegue criar uma conta e entrar no sistema.
- [ ] Um professor só vê os alunos vinculados ao seu espaço.
- [ ] Um aluno só vê os próprios dados e os conteúdos permitidos.
- [ ] Um aluno não consegue editar dados administrativos do professor.
- [ ] Um professor não consegue acessar registros de outro professor alterando um identificador na URL ou na requisição.

### 14.2 Alunos

- [ ] O professor consegue criar, consultar, editar e arquivar um aluno.
- [ ] A ficha do aluno mostra suas aulas e os conteúdos pertinentes.
- [ ] Arquivar o aluno não apaga o histórico.
- [ ] A conta do aluno pode ser associada ao vínculo após convite ou ativação segura.

### 14.3 Planos mensais

- [ ] O professor consegue criar e editar um plano mensal.
- [ ] O plano aceita vários itens de planejamento.
- [ ] Cada item pode ter vários vídeos associados.
- [ ] Um rascunho não aparece para o aluno.
- [ ] A publicação respeita os alunos autorizados.
- [ ] Alterar o plano não modifica silenciosamente o histórico de aulas concluídas.

### 14.4 Biblioteca

- [ ] O professor consegue criar técnicas e módulos.
- [ ] O professor consegue adicionar e editar metadados de vídeos.
- [ ] O sistema indica quando um vídeo ainda está processando ou falhou.
- [ ] Vídeos podem ser reutilizados em diferentes planos e aulas.
- [ ] O aluno não consegue reproduzir um vídeo sem autorização.

### 14.5 Agenda e aulas

- [ ] O professor consegue agendar, editar e cancelar uma aula.
- [ ] O professor consegue marcar uma aula como realizada.
- [ ] O professor consegue registrar falta.
- [ ] A agenda semanal mostra corretamente os horários e estados.
- [ ] O histórico do aluno exibe as aulas corretas.
- [ ] Apenas aulas realizadas entram na contagem de aulas concluídas.
- [ ] O reagendamento não destrói o histórico da ocorrência anterior.

### 14.6 Área do aluno

- [ ] O aluno consegue ver a próxima aula.
- [ ] O aluno consegue consultar aulas passadas e futuras.
- [ ] O aluno consegue abrir os vídeos liberados.
- [ ] O aluno não vê observações privadas do professor.
- [ ] A interface funciona em telas pequenas.

---

## 15. Indicadores de produto

Durante testes com usuários, acompanhar indicadores que mostrem se o aplicativo está resolvendo o problema.

**Ativação:**

- Professores que concluem o perfil.
- Professores que cadastram pelo menos um aluno.
- Professores que publicam o primeiro plano.
- Professores que adicionam o primeiro vídeo.

**Uso recorrente:**

- Professores ativos por semana.
- Alunos ativos por semana.
- Aulas agendadas e concluídas.
- Planos publicados por mês.
- Vídeos associados a aulas.
- Acessos à biblioteca de vídeos.

**Qualidade:**

- Erros ao agendar ou reagendar.
- Falhas de upload ou reprodução.
- Problemas de autorização.
- Solicitações de suporte.
- Feedback de professores e alunos.

Não é necessário definir metas numéricas antes de ter uma linha de base. Primeiro, coletar dados confiáveis e conversar com usuários; depois, estabelecer metas realistas.

---

## 16. Modelo comercial futuro

A plataforma pode futuramente usar uma assinatura por professor, possivelmente com limites diferentes. Os limites precisam estar concentrados numa camada de configuração, não espalhados pelo código.

### Possíveis dimensões dos planos

- Quantidade de alunos ativos.
- Espaço de armazenamento ou volume de vídeo.
- Recursos de relatórios.
- Número de instrutores, caso haja suporte a academias.
- Personalização da marca.
- Recursos avançados de notificação.

### Exemplo conceitual de níveis

- **Inicial:** funcionalidades essenciais e limite reduzido de alunos.
- **Profissional:** maior capacidade e recursos de organização.
- **Academia:** vários instrutores e gestão compartilhada, se esse público for atendido.

Os nomes, limites e preços não devem ser definidos sem pesquisa com professores e análise dos custos de infraestrutura, principalmente hospedagem e reprodução de vídeos.

---

## 17. Riscos e decisões que precisam ser fechadas

### 17.1 Hospedagem e custo dos vídeos

Vídeos podem representar uma parte importante do custo operacional. Antes do lançamento, comparar provedores considerando armazenamento, processamento, reprodução, largura de banda, segurança e experiência de upload. Evitar depender exclusivamente de links públicos externos sem controle de acesso.

### 17.2 Regra de publicação dos planos

Definir se cada plano será visível para todos os alunos do professor, para um grupo específico ou individualmente. Essa decisão afeta o banco, a interface e as políticas de acesso.

### 17.3 Planejamento por dia da semana versus data concreta

Um planejamento como “toda segunda-feira: guarda fechada” não é idêntico a uma agenda que diz “segunda-feira, 9 de novembro”. O produto deve deixar claro se o plano é um modelo semanal ou um calendário datado. Essa é uma das decisões mais importantes antes de implementar a agenda.

### 17.4 Geração das aulas recorrentes

Definir se o sistema apenas armazena horários fixos ou gera automaticamente ocorrências de aula. Se gerar, deve evitar duplicações e tratar exceções, pausas e mudanças de horário.

### 17.5 Histórico e edições

Decidir quais informações serão preservadas como fotografia da sessão concluída, principalmente título do planejamento, observações e lista de vídeos. Sem isso, editar um plano pode mudar a interpretação de uma aula antiga.

### 17.6 Acesso à biblioteca

Definir se a permissão será dada por vídeo, módulo, técnica ou associação a uma aula. É possível suportar todos os níveis no futuro, mas o MVP deve ter uma regra principal clara.

### 17.7 Aluno com múltiplos professores

A arquitetura recomendada permite múltiplos vínculos, mas a interface deverá deixar claro quem é o professor responsável por cada conteúdo. Compartilhamentos entre professores devem ser explícitos, nunca automáticos.

### 17.8 Privacidade e operação

Definir política de privacidade, tratamento de dados, suporte, backups e procedimentos para solicitações de exclusão ou exportação. Isso deve ser considerado antes de abrir o produto publicamente.

---

## 18. Decisões recomendadas para começar

Para reduzir ambiguidades, esta é a configuração inicial recomendada:

1. Construir uma aplicação web responsiva, não dois aplicativos nativos separados.
2. Usar Next.js, TypeScript e PostgreSQL com uma solução de autenticação pronta.
3. Tratar cada professor como proprietário de seu espaço de dados.
4. Representar o relacionamento com o aluno por uma tabela de vínculo independente.
5. Separar planejamento mensal, horário recorrente e ocorrência real de aula.
6. Organizar biblioteca como técnica → módulo → vídeo.
7. Permitir que um dia planejado e uma aula concreta tenham vários vídeos.
8. Preservar o histórico de aulas realizadas.
9. Restringir a reprodução de vídeos mediante autorização no servidor.
10. Lançar primeiro cadastro, agenda, planos, biblioteca e área do aluno.
11. Adiar pagamentos, marketplace, inteligência artificial e recursos de academia.
12. Validar a experiência com professores particulares reais antes de expandir.

---

## 19. Checklist de preparação para desenvolvimento

Antes de começar a implementação, confirmar os itens abaixo:

- [ ] Definir nome provisório do produto.
- [ ] Definir se o aluno pode ter mais de um professor na primeira versão.
- [ ] Definir se o aluno recebe convite por e-mail, telefone ou ambos.
- [ ] Definir se os planos mensais serão modelos por dia da semana ou calendários com datas concretas.
- [ ] Definir como um plano é atribuído/publicado para alunos.
- [ ] Definir o comportamento das recorrências e das exceções de agenda.
- [ ] Definir estados finais da aula e a regra de contagem.
- [ ] Definir a regra inicial de autorização dos vídeos.
- [ ] Escolher o serviço de mídia depois de comparar custos e controles de acesso.
- [ ] Criar wireframes das telas principais.
- [ ] Revisar o modelo de dados e as políticas de segurança.
- [ ] Escrever testes de autorização antes de liberar o produto a usuários reais.
- [ ] Definir política de privacidade e procedimentos de suporte.

---

## 20. Glossário

**Aluno:** pessoa que recebe aulas e conteúdos de um professor.

**Vínculo / matrícula (`enrollment`):** relação específica entre um professor e um aluno. Guarda o estado daquele acompanhamento.

**Plano mensal:** planejamento pedagógico do que se pretende ensinar ao longo de um período.

**Dia planejado (`plan_day`):** item de conteúdo dentro de um plano mensal.

**Horário recorrente (`weekly_slot`):** regra de horário repetida semanalmente, como toda terça-feira às 18h.

**Aula (`lesson`):** ocorrência concreta com data, horário, estado e conteúdo da sessão.

**Técnica:** item de organização da biblioteca de Jiu-Jitsu.

**Módulo:** agrupamento de vídeos dentro de uma técnica.

**Vídeo:** conteúdo de mídia cujo arquivo é hospedado num serviço de vídeo e cujos metadados são registrados no banco.

**RLS (Row Level Security):** mecanismo do PostgreSQL/Supabase usado para limitar quais registros podem ser lidos ou alterados por cada usuário.

**MVP:** versão mínima que entrega o fluxo principal do produto e permite validar a proposta com usuários reais.

---

## Conclusão

A arquitetura proposta posiciona o aplicativo como uma plataforma de **planejamento, agenda, biblioteca técnica e acompanhamento individual de Jiu-Jitsu**. O ponto central é manter os conceitos separados, mas conectados: o planejamento orienta a aula, a agenda organiza a sessão e o histórico registra o que realmente aconteceu.

Com um MVP enxuto, regras de acesso bem definidas e um modelo de dados que preserve a história das aulas, o projeto poderá crescer gradualmente para atender professores independentes e, futuramente, academias ou equipes com mais instrutores.
