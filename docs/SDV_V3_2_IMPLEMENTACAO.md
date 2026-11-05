# SDV v3.2 — implementação e execução

Esta aplicação simula viaturas e ocorrências em ruas de Feira de Santana. Não é um sistema homologado para despacho real de emergências.

## Entregas

- PR #3: sessão com refresh HttpOnly/Strict, JWT em memória e restauração após reload.
- PR #4: correções de HCL, validação Terraform e encaminhamento de /auth/* sem cache.
- PR #5: operação v3.2, migrations, testes e relatório de aceite.

Os PRs são encadeados: baseline executável → sessão → infraestrutura → operação. Não houve merge automático nem deploy pago.

## Mapa e operação

Todos os mapas utilizam MapLibre GL JS. MapTiler fornece Dataviz Light/Dark e geocoding; OSRM fornece geometria e ETA. Os carros SVG são originais, com volume, pneus, vidros, sombra e direção: verde disponível/patrulhando, azul em deslocamento, roxo no local, cinza com sinal atrasado/indisponível. Estados também têm rótulos e legenda.

A posição persistida no backend permanece canônica. O navegador interpola apenas entre progressos confirmados, sobre a geometria conhecida; respeita movimento reduzido e não extrapola GPS ausente. A câmera permanece estável, com acompanhamento opt-in. Rotas de patrulha não são desenhadas em massa.

O formulário aceita endereço, CEP e pin arrastável. CEP é aproximado. Busca e reverse geocoding possuem cancelamento de respostas obsoletas. Sem confirmação explícita, descrição e endereço/referência, a criação fica bloqueada no frontend e no backend. O clientRequestId permanece estável durante uma tentativa.

## Persistência e consistência

Cada domínio mantém seu banco. PostgreSQL condicional e unicidade continuam garantindo exclusividade; Redis lock é auxiliar. Outbox, Streams at-least-once, reentrega e reconciliação permanecem ativos.

Turnos são abertos pelo seed ou cadastro administrativo. Viaturas livres com turno ativo patrulham rotas OSRM entre destinos urbanos aprovados, com cache e validação de área/snap/velocidade. Despacho suspende a patrulha atomicamente; encerramento retoma a partir da posição atual. CAS impede avanço duplo. Pausar a simulação conserva heartbeat; perda de GPS interrompe heartbeat e movimento.

chegadaEm é gravado uma vez no commit de NO_LOCAL. Eventos preservam o horário de origem e têm chave única de idempotência. A timeline não deriva eventos de atualizadoEm. ETA original permanece separado da previsão atual e do fator de aceleração. Métricas usam a janela local America/Bahia; cancelamentos não contam como conclusões.

Posições chegam por subscriptions e consultas dirigidas à entidade; snapshots de reconciliação continuam após reconnect e periodicamente. Versões impedem regressão.

## Configuração

Configure as variáveis de .env.example no ambiente de cada processo. Não versione .env nem chaves privadas.

VITE_MAPTILER_API_KEY é uma chave pública de navegador: configure restrições de domínio e quota no MapTiler. VITE_MAP_STYLE_URL e VITE_MAP_DARK_STYLE_URL aceitam estilos customizados. Sem provedor configurado, a aplicação informa indisponibilidade; não inventa ruas. MapTiler é contratado separadamente da AWS.

OSRM_URL aponta para um serviço OSRM real no uso operacional. A fixture de CI não comprova cobertura cartográfica real. FRONTEND_ORIGIN exige origens exatas, sem wildcard.

Preparação:
1. npm install --no-audit --no-fund
2. docker compose up -d --wait
3. node scripts/bootstrap-databases.mjs
4. npm run db:generate
5. npm run db:migrate
6. npm run seed
7. npm run build

Execute Gateway, Ocorrências, Viaturas, Worker, Simulador e frontend com as variáveis exportadas. O README da base descreve os comandos dev:*.

## Validação reproduzível

O workflow .github/workflows/ci.yml executa a preparação completa com PostgreSQL/Redis reais:
- npm run lint; npm test; npm run build
- npm run test:operations (ciclo operacional, CAS e métricas/paginação)
- node tests/gps.mjs
- npm run test:concurrency
- npm run test:session
- npm run test:recovery com worker principal parado e SDV_WORKER_CONTROL=1
- Playwright desktop/mobile, contraste WCAG AA, HTTPS local e expiração WebSocket
- terraform fmt -check, init -backend=false e validate, sem apply

Fixtures OSRM/MapTiler/ViaCEP são explícitas. O TLS local usa certificado temporário em /tmp; a exceção do navegador fica restrita ao teste local. Nunca há trace com credenciais.

tests/reset.mjs é destrutivo exclusivamente aos bancos locais descartáveis especificados no script. Exige NODE_ENV=test, SDV_ALLOW_TEST_RESET=1 e hosts 127.0.0.1. Não o execute com serviços de teste ainda ativos.

Os failpoints do worker só operam com NODE_ENV=test. SDV_TEST_STREAM isola os Streams usados pelos testes de crash. Essas opções não habilitam falhas em produção.

## Compatibilidade e limites

As migrations são aditivas, preservam registros legados e não inventam timestamps ausentes. A descrição legada é preenchida apenas no backfill; novos inputs são obrigatórios. O contrato de criação v3.2 exige metadados e confirmação: consumidores antigos devem ser atualizados junto ao frontend. Não retorne a um writer antigo sem uma migração de compatibilidade.

A homologação de tiles, rótulos, cobertura real de endereços/CEPs, quota e custo do MapTiler depende de uma chave restrita e da conta do provedor. CloudFront/ALB/AWS reais não foram provisionados nesta tarefa. Nenhum desses itens é aprovado apenas por mocks ou terraform validate. Consulte a matriz de aceite e os artefatos do CI.
