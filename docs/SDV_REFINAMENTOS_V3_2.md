# Refinamento v3.2: movimento urbano e registro de ocorrências

Base: `feat/sdv-v3-operations`, PR #5, commit `52b3895fc9c177f1d9354e1013784ec735f69c65`. Este incremento mantém a cadeia de PRs do baseline executável e não executa deploy AWS.

## Comportamento implementado

A navegação passa de 200 para 272 px, com 252 px em notebooks e menu de 272 px no celular. A Central operacional mantém mapa dominante, indicadores e fila ordenada por prioridade e horário. O Mapa operacional oferece uma área geográfica ampliada, filtros de disponibilidade, controle de rotas e detalhes apenas quando uma entidade é selecionada.

O simulador passa a usar 1× por padrão. Na primeira inicialização da nova versão, uma operação Redis atômica troca o antigo fator persistido por 1×; depois disso, escolhas explícitas do laboratório continuam persistidas. O botão “Restaurar velocidade real (1×)” permite retornar ao padrão.

O movimento usa distância efetiva da geometria OSRM, com perfil determinístico por viatura: cruzeiro de 25,2–39,6 km/h em patrulha e 32,4–50,4 km/h em deslocamento. A velocidade efetiva varia ao longo do percurso, acelera entre 1,1 e 1,7 m/s² e freia com limite de 2,2 m/s², antecipando curvas e a parada no destino. O modo acelerado continua disponível apenas como controle explícito de laboratório. As velocidades gravadas representam m/s físicos, sem multiplicação pelo fator do relógio.

O modelo é fictício: não detecta semáforos, congestionamentos, pedestres, limites sinalizados de cada rua nem trânsito ao vivo. Reduções por geometria e variação de cruzeiro não são apresentadas como informações de tráfego real.

O GPS atualiza aproximadamente a cada 900 ms. O navegador mantém uma janela de 1.800 ms para interpolar entre amostras confirmadas, respeitando timestamps, versões e geometria. Não extrapola além do último ponto recebido. Sem sinal ou com movimento reduzido, mostra a posição confirmada sem animação. Cálculo de novas rotas ocorre fora do ciclo de GPS: uma resposta OSRM lenta não interrompe heartbeat e deslocamento das demais viaturas. A próxima perna de patrulha é preparada antes do fim da atual.

As rondas usam destinos urbanos centrais e rejeitam geometria que exceda um raio simulado de 6 km a partir de `-12.260, -38.966`. Isso é um limite do simulador, não a divisa oficial de Feira de Santana. Posições legadas externas podem retornar por rotas limitadas à distância inicial mais 150 m, sem teletransporte. A restrição da ronda não impede atendimento a uma ocorrência válida da área operacional já existente.

As rotas de despacho passam a 6 px, ou 8 px quando selecionadas, com extremidades arredondadas. Somente o trecho restante é desenhado, e a linha desaparece na chegada. Os SVGs originais de viatura continuam com volume, sombra, rotação e cores por status. A legenda usa marcadores CSS e texto, sem emojis.

## Localização e formulário

O adapter separa busca textual e consulta reversa. A busca textual mantém debounce, cancelamento, país, proximidade e área. A reversa usa `longitude,latitude` e `limit=1`, sem os filtros exclusivos da busca textual. O limite 6 anterior, sem exatamente um tipo, violava o contrato da consulta reversa MapTiler. A fixture agora responde HTTP 400 para esse erro de parâmetros.

Resultados aceitam `center` ou `geometry.coordinates` e extraem bairro, CEP e número quando fornecidos. ViaCEP complementa bairro e CEP. Dados ausentes, incluindo complemento da unidade, não são inventados. O pin mantém suas próprias coordenadas, independentemente do centro do endereço próximo; alterações manuais durante a consulta são preservadas. Erros de acesso, limite, indisponibilidade e ausência de resultados têm mensagens distintas. Pin com referência continua permitido quando a consulta falha.

Sugestões aparecem em popup ancorado ao campo, com limite de altura, scroll e navegação por teclado, sem empurrar o formulário. Tipo volta a ser select com catálogo e opção “Outro”. As cinco prioridades mantêm a ordem numérica do backend: 1 Baixa (verde), 2 Moderada (azul), 3 Alta (âmbar), 4 Urgente (laranja), 5 Crítica (vermelho). Rótulos acompanham as cores.

O modal possui fechamento por ícone SVG, Escape e contenção de foco. Avisos de login anteriores são limpos ao abrir o formulário. O seletor de localização não mostra a legenda de frota; as instruções têm uma faixa própria abaixo do canvas, sem cobrir o pin ou a atribuição.

## ETA e migração

Execute `npm run db:generate` e `npm run db:migrate` antes de iniciar os serviços atualizados. A migration aditiva `20261105040000_initial_arrival_forecast` adiciona `Despacho.previsaoChegadaInicialEm`, preservada após alterações de fator e pausas. Dados antigos ficam nulos, com comparação explicitamente indisponível.

A interface mostra ETA restante, duração observada e diferença em relação à previsão inicial em minutos e segundos, por exemplo `2 min 15 s`. A diferença usa timestamps persistidos e o relógio da simulação: inclui pausas e mudanças de fator, sem atribuir isso a trânsito real. O ETA atual acompanha o modelo de movimento; o ETA viário inicial OSRM é mantido para auditoria.

## Executar e validar

Siga o desenvolvimento local do [README](../README.md), com PostgreSQL, Redis e OSRM configurados e `VITE_MAPTILER_API_KEY` pública restrita por origem. Carregue `.env` em cada terminal antes de iniciar os seis processos. Use `SIMULATION_SPEED_FACTOR=1`; para confirmar a configuração compartilhada, abra Laboratório e clique “Restaurar velocidade real (1×)”.

A suíte requer bancos **locais isolados**, `NODE_ENV=test` e credenciais de teste em `.env.test` não versionado. `tests/fixtures/osrm.mjs` atende na porta 5010; o frontend de teste recebe `VITE_MAPTILER_API_KEY=test-only-fixture`, enquanto Playwright intercepta MapTiler/ViaCEP. Não use a fixture de rotas como servidor cartográfico real.

```sh
npm ci --no-audit --no-fund
npm run db:generate
npm test
npm run lint
npm run build
npm run test:operations
node tests/urban-motion.mjs
node tests/routing-latency.mjs
node tests/gps.mjs
npm run test:concurrency
# Pare o worker normal do ambiente isolado antes do teste de crash:
SDV_WORKER_CONTROL=1 npm run test:recovery
# Reinicie o worker antes dos testes seguintes.
npm run test:session
npx playwright test --workers=1 --reporter=line
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
```

Testes de UI cancelam somente as ocorrências que criaram, por API autorizada, e restauram 1×. Isso evita esgotar a frota durante validações repetidas. O teste de latência injeta quatro segundos de atraso exclusivamente na fixture OSRM e verifica GPS/heartbeat independentes.

O fixture [osrm-feira-centro.json](../tests/fixtures/osrm-feira-centro.json) registra uma consulta real gratuita ao OSRM público, com atribuição OpenStreetMap: 1.035,9 m, 116,2 s estimados e 38 vértices. O modelo percorreu essa geometria em 131 s simulados, com máximo de 35,57 km/h, e parou no destino. O teste unitário reproduz o movimento sobre a geometria gravada sem acesso à rede. Uma rota não homologa toda a cidade.

Os resultados, SHA e capturas deste incremento estão em [SDV_REFINAMENTOS_V3_2_RESULTADOS.md](SDV_REFINAMENTOS_V3_2_RESULTADOS.md). A matriz histórica da entrega anterior permanece em [SDV_V3_2_RESULTADOS.md](SDV_V3_2_RESULTADOS.md). Estilos, rótulos e cobertura real de endereços MapTiler continuam dependendo de chave e conta configuradas; screenshots com mocks não comprovam essa cobertura. Nenhum recurso AWS pago foi provisionado.
