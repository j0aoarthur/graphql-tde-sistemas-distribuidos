# SDV — Protocolo de testes no Codex Cloud

**Criado em:** 2026-11-04
**Estado:** roteiro e critérios para execução. **Não foi executado no Codex Cloud neste chat**.
**Escopo:** validar a Entrega Integrada v2 e implementar/validar a evolução v3.2 de mapa, auth, ETA, patrulhamento, timeline e viaturas 3D.

> **Pré-requisito bloqueante:** a branch main do repositório remoto atualmente inclui apenas a apresentação e a documentação, não o código do monorepo executável. A base \`SDV_Entrega_Integrada_v2.zip\` foi entregue em uma conversa ChatGPT e deve ser adicionada ao repositório em uma **branch de código** antes de iniciar os testes de integração no Codex Cloud. Não execute ou marque como aprovado apenas por ler documentos.

## Preparação do ambiente Codex Cloud

1. No ChatGPT/Codex web ou desktop, crie e **publique** ambiente de nuvem para o repo \`j0aoarthur/graphql-tde-sistemas-distribuidos\`. Escolha a branch do baseline executável, não a branch de documentos.
2. Use Node.js 22+ e npm; no ambiente configure instalação de dependências. A instalação que existe no monorepo v2 é \`npm install --no-audit --no-fund\`, pois a entrega v2 não traz package-lock.
3. O projeto usa PostgreSQL, Redis e OSRM. Execute \`docker compose up -d --wait\` quando o ambiente tiver Docker disponível. Se o Codex Cloud não permitir Docker daemon, use os serviços de teste admitidos no ambiente e registre os testes inviáveis; **não invente evidências**.
4. Para georroteamento, preferir fixtures determinísticas OSRM para CI e execução real de OSRM em teste de integração dedicado; não fazer download de dados grandes em cada teste, salvo quando houver recurso e autorização.
5. Use variáveis locais **de teste** (\`.env.test\` não versionado). Não habilite AWS paga; nenhuma tarefa de teste pode aplicar Terraform, criar RDS/Fargate ou consumir créditos sem autorização separada.
6. MapTiler: em CI, mock da API Geocoding/tile requests. Em teste visual real, utilizar uma chave pública **restrita por origem e quota** fornecida via secrets do ambiente. Não registrar chaves ou JWT nos logs.
7. Cuidado: a infraestrutura AWS Single-AZ não promete recuperação de falha de AZ. Não confundir essa limitação com recuperação de processos/containers.

## Ordem obrigatória dos testes

### Etapa 0 — Auditoria e baseline

- Listar árvore de arquivos e dependências, checar versões e contratos GraphQL.
- \`npm install --no-audit --no-fund\`
- \`npm run db:generate\`
- \`npm test\`
- \`npm run build\`
- \`terraform -chdir=infra/terraform fmt -check -recursive\`
- \`terraform -chdir=infra/terraform init -backend=false\`
- \`terraform -chdir=infra/terraform validate\`
- Anexar logs. Se ferramenta estiver indisponível, marcar **BLOQUEADO**, nunca **PASSOU**.

### Etapa 1 — Integração distribuída

- Subir PostgreSQL e Redis independentes, rodar \`node scripts/bootstrap-databases.mjs\`, \`npm run db:migrate\` e \`npm run seed\`.
- Subir services de Ocorrências, Viaturas, Gateway, Worker e simulador.
- Executar \`npm run test:concurrency\` com **duas centrais** e alocação concorrente da mesma viatura: confirmar apenas um despacho ativo por viatura no PostgreSQL, inclusive após erro/retry.
- Testar repetição da mesma mutation com clientRequestId e o mesmo evento Streams.
- Derrubar worker antes do XACK e durante reentrega: estado final convergente, sem despacho duplicado.
- Testar crash após commit no banco de Viaturas e antes da confirmação no banco de Ocorrências, com reconciliação.

### Etapa 2 — Autenticação

- Após login, atualizar a página: sessão continua, sem loop ou flash de login; tokens permanecem fora de localStorage.
- Após 15 min, refresh token rotativo funciona; logout revoga sessão.
- Testar 401/reautenticação WebSocket, duas abas concorrentes, CSRF e flags Secure/HttpOnly/SameSite.
- A Entrega v2 **não implementa** refresh token; implementar antes de aprovar estes critérios.

### Etapa 3 — Ocorrências e localização

- Validar geocoding MapTiler por endereço, bairro, estabelecimento e CEP de Feira de Santana; ViaCEP com retorno aproximado; limites/sem resultados.
- Seleção pelo mapa desenha **imediatamente pin arrastável**, reverse geocoding, confirmação visível. Sem confirmação, mutation bloqueada.
- Persistir descrição, endereço, origem do ponto e coordenadas; payload corresponde exatamente à seleção.
- ETA preliminar por OSRM Table Service antes de reservar, recalculado para viatura alocada.

### Etapa 4 — Telemetria, patrulha e rotas

- Viaturas disponíveis com turno ativo percorrem ruas reais em Feira de Santana, sem teletransporte.
- Viatura despachada suspende patrulha atomicamente e segue do último GPS confirmado até ocorrência; no encerramento retoma patrulha.
- Testar duas réplicas do simulador na mesma viatura: CAS/versões impedem avanço duplo.
- \`ultimoSinalEm\` distinto de \`atualizadoEm\`; atraso/falha congela ícone e informa sinal indisponível.
- \`chegadaEm\` gravado na mesma transação de NO_LOCAL; reentrega preserva o valor original.
- Timeline com eventos persistidos, timestamps com segundos e autoria; estatísticas hoje (America/Bahia) e turno ativo originam-se do banco.

### Etapa 5 — Frontend e UX

- MapLibre GL JS + MapTiler, mapa minimalista e contrastante, legenda, pin de ocorrência e veículos 3D (asset original) coloridos por status.
- Carros animados por requestAnimationFrame sobre rota OSRM, rotação coerente com heading, seleção e zoom sem resetar viewport.
- Operação map-first na home (mapa 65–72% do workspace em 1366x768), sem banner promocional, side panel integrado, mobile bottom sheet.
- Snapshot inicial + subscriptions incrementais; reconexão reconcilia versões e não regride status.
- Rodar testes Playwright com screenshots nos viewports 1366x768, 1440x900 e 390x844; verificar contraste WCAG AA para texto.
- Testar três despachos em paralelo e várias viaturas em patrulha, com perda de sinal e rota selecionada.

### Etapa 6 — Segurança, infraestrutura e entrega

- Validar que nenhum segredo vai para Git, Vite ou logs de CI.
- Testar \`terraform validate\`, IAM/OIDC sem permissões excessivas, ECS Single-AZ, ALB com duas sub-redes conforme requisito AWS, orçamento como aviso, não hard stop.
- Testar Build/CI GitHub Actions e ações de rollback do ECS onde couber, sem executar deploy pago.
- Abrir PRs pequenos, com migrations reversíveis/compatíveis e evidências do CI.

## Matriz de resultados

Para cada critério, produzir linha \`ID | status (PASSOU/FALHOU/BLOQUEADO) | comando/teste | log/screenshot | commit SHA | observação\`.

Critérios-fonte:
- \`relatorio-planejamento-tecnico-sdv.md\` (requisitos distribuídos);
- \`docs/SDV_PLANO_EVOLUCAO_UX_MAPA_AUTENTICACAO_V3.md\` (v3.2 e aditivo v3.1).

**Regra de aprovação:** nenhum critério marcado PASSOU sem evidência reproduzível. Nada de afirmar que tudo está homologado se faltarem Docker, Redis, PostgreSQL, OSRM, MapTiler ou AWS. Para testes que exigem AWS real, só executar após autorização explícita do usuário para custos e recursos.

## Texto para iniciar tarefa no Codex Cloud

> Trabalhe no repositório \`j0aoarthur/graphql-tde-sistemas-distribuidos\`, na branch que contém o baseline executável SDV v2. Leia \`AGENTS.md\`, o relatório original, o plano UX v3.2 e este protocolo. Implemente e teste os requisitos pendentes em incrementos pequenos. Execute testes unitários, compilação, integração PostgreSQL/Redis/GraphQL, testes de concorrência e testes E2E Playwright da interface MapLibre + MapTiler usando fixtures e mocks onde adequado. Corrija erros e execute novamente a suíte. Gere matriz de critérios com status e links para logs e screenshots. Não faça deploy AWS nem dê aprovações fictícias. Abra PR(s) com evidências de teste. Se a branch executável não existir, pare e informe o bloqueio, sem simular execução.
