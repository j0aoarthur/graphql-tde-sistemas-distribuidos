# Resultados do refinamento SDV v3.2

Data: 2026-11-05. Código validado: `6e39dd9583d8882524030eef28f5cd269fb29e59`. Branch: `fix/sdv-realistic-motion-form`, baseada no PR #5 (`feat/sdv-v3-operations`). Commits posteriores deste incremento acrescentam somente documentação e evidências.

**Resultado local: 10 testes unitários e 16 testes Playwright aprovados, build dos seis apps, lint e integração PostgreSQL/Redis aprovados.** Testes executados com Node.js 24.22.1, PostgreSQL 16 e Redis 7, em serviços isolados das execuções anteriores. A validação de infraestrutura executou somente Terraform fmt/init/validate, sem plan/apply/deploy.

Os arquivos abaixo são evidências permanentes sem senhas, chaves reais ou tokens. Capturas com fundo neutro usam explicitamente um estilo MapTiler de fixture; não representam a cartografia real do provedor.

## Critérios solicitados neste incremento

Todas as linhas PASSOU referem-se ao SHA acima, no escopo indicado.

| ID | Status | Critério e validação executada | Evidência |
| --- | --- | --- | --- |
| REF-NAV | **PASSOU** | Sidebar >=250 px no desktop; navegação e menu responsivos. `refinements.spec.ts` | [E2E](evidence/refinements/playwright.log), [central desktop](evidence/refinements/central-1366.png) |
| REF-CENTRAL | **PASSOU** | Central com fila e KPIs; mapa dedicado com filtros e rotas, sem duplicar a fila. `refinements.spec.ts` | [Mapa dedicado](evidence/refinements/mapa-dedicado.png) |
| REF-MOVEMENT | **PASSOU** | Interpolação sobre geometria com amostras confirmadas, sem pausa fixa de 1.200 ms. Curvas, continuidade entre updates e congelamento sem dados. `renderer.spec.ts; refinements.spec.ts; gps.spec.ts` | [E2E](evidence/refinements/playwright.log) |
| REF-SPEED | **PASSOU** | 1×, velocidades individuais, aceleração, frenagem em curva/destino e velocidade física limitada. `motion.test.cjs; urban-motion.mjs` | [Unitários](evidence/refinements/unit.log), [integração](evidence/refinements/integration.log) |
| REF-ROUTING | **PASSOU** | OSRM com atraso de 4 s não bloqueia movimento/heartbeat da frota; instalação posterior por CAS. `routing-latency.mjs` | [Integração](evidence/refinements/integration.log) |
| REF-AREA | **PASSOU** | Ronda dentro do raio simulado de 6 km; rejeição de desvios externos e retorno limitado de posições legadas. `motion.test.cjs; urban-motion.mjs` | [Unitários](evidence/refinements/unit.log), [integração](evidence/refinements/integration.log) |
| REF-PIN | **PASSOU** | Reverse usa parâmetros válidos; pin imediato, drag e coordenadas exatas na mutation; referência permite seguir em caso de erro. Fixture rejeita o antigo limit inválido. `operations.spec.ts` | [E2E](evidence/refinements/playwright.log), [pin mobile](evidence/refinements/pin-390.png) |
| REF-AUTOFILL | **PASSOU** | Bairro, CEP e número retornados preenchem campos; edição manual e pin mais recente prevalecem sobre respostas antigas. `operations.spec.ts` | [E2E](evidence/refinements/playwright.log) |
| REF-FORM | **PASSOU** | Tipo em select, opção Outro, inputs e fechamento redesenhados; confirmação pendente bloqueada durante reverse. `operations.spec.ts; lifecycle.spec.ts; refinements.spec.ts` | [Formulário desktop](evidence/refinements/address-popup-1366.png) |
| REF-SUGGEST | **PASSOU** | Popup absoluto ancorado ao input, sem deslocar o formulário; seleção por opção acessível. `operations.spec.ts` nos três viewports | [Popup desktop](evidence/refinements/address-popup-1366.png), [popup mobile](evidence/refinements/address-popup-390.png) |
| REF-LEGEND | **PASSOU** | Sem legenda de frota no seletor; faixa de instrução fora do canvas, sem cobrir o pin. Verificação geométrica nos três viewports. `operations.spec.ts` | [Pin mobile](evidence/refinements/pin-390.png), [pin desktop](evidence/refinements/pin-1366.png) |
| REF-PRIORITY | **PASSOU** | Cinco categorias ordenadas e cinco cores distintas, com texto. `refinements.spec.ts` | [E2E](evidence/refinements/playwright.log) |
| REF-CLOSE | **PASSOU** | Botão de fechar com SVG; Escape encerra o modal; contraste AA do formulário. `refinements.spec.ts` | [E2E](evidence/refinements/playwright.log) |
| REF-ROUTE | **PASSOU** | Linha restante, 6/8 px, sem segmento já consumido; término não mantém trajeto completo. `refinements.spec.ts; renderer.spec.ts; scene.spec.ts` | [E2E](evidence/refinements/playwright.log), [três despachos](evidence/refinements/tres-despachos.png) |
| REF-ETA | **PASSOU** | Previsão inicial persistida e imutável após fator/pausa; ETA e diferença da chegada em minutos e segundos; F5 mantém chegada. `operations.mjs; lifecycle.spec.ts; refinements.spec.ts` | [Integração](evidence/refinements/integration.log), [E2E](evidence/refinements/playwright.log) |
| REF-ICONS | **PASSOU** | SVG original das viaturas com cores por status; legenda CSS e fechamento por ícone, sem emojis na interface. `scene.spec.ts; refinements.spec.ts` | [Central](evidence/refinements/central-1366.png), [E2E](evidence/refinements/playwright.log) |
| REF-REGRESSION | **PASSOU** | Concorrência de duas centrais, réplicas/CAS, replay, crash após commit/antes ACK, sessão, TLS local, reconexão WS, timeline e métricas Bahia. | [Integração](evidence/refinements/integration.log), [E2E](evidence/refinements/playwright.log) |

## Comandos executados

| Comando | Status | Evidência |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | **PASSOU** | [Instalação](evidence/refinements/install.log) |
| `npm run db:generate; npm run db:migrate; npm run seed` | **PASSOU** | [Prisma e bancos](evidence/refinements/database.log) |
| `npm test` | **PASSOU** | [10 testes](evidence/refinements/unit.log) |
| `npm run lint; npm run build` | **PASSOU** | [Lint e seis apps](evidence/refinements/quality.log) |
| `npm run test:operations; node tests/urban-motion.mjs; node tests/routing-latency.mjs; node tests/gps.mjs` | **PASSOU** | [Integração](evidence/refinements/integration.log) |
| `npm run test:concurrency; SDV_WORKER_CONTROL=1 npm run test:recovery; npm run test:session` | **PASSOU** | [Integração](evidence/refinements/integration.log) |
| `npx playwright test --workers=1 --reporter=line` | **PASSOU** | [16 testes](evidence/refinements/playwright.log); 1366×768, 1440×900 e 390×844 |
| `terraform fmt -check -recursive; terraform init -backend=false; terraform validate` | **PASSOU** | [Terraform](evidence/refinements/terraform.log) |
| Uma consulta gratuita ao OSRM público, seguida de replay determinístico da geometria gravada | **PASSOU** | [Registro](evidence/refinements/osrm-real-smoke.log), [fixture com atribuição](../tests/fixtures/osrm-feira-centro.json) |

## Limites da validação

| Item externo | Status | Motivo |
| --- | --- | --- |
| MapTiler real: chave restrita, quotas, estilos, rótulos e cobertura de ruas/CEPs/números | **BLOQUEADO** | Não existe chave real configurada neste ambiente. Foram executados mocks de contrato e comportamento, incluindo HTTP 400/503, concorrência de consultas e campos ausentes. |
| AWS real: CloudFront/ALB/ECS/RDS/ElastiCache | **BLOQUEADO** | Nenhum deploy pago foi autorizado ou executado. TLS foi testado com proxy HTTPS local. |
| Desempenho em todos os dispositivos/GPU e trânsito real | **BLOQUEADO** | Chromium com renderização de teste verifica a geometria e a animação; não certifica FPS de todos os aparelhos nem representa semáforos/congestionamentos ao vivo. |

Os quatro critérios cartográficos bloqueados da [matriz histórica v3.2](SDV_V3_2_RESULTADOS.md) continuam bloqueados no escopo do provedor real. O aviso de bundle grande do MapLibre permanece no build e não foi apresentado como medição de desempenho.

## Correções encontradas na validação

Além dos problemas solicitados, foram corrigidos um fragmento CSS inválido herdado da base que impedia o build, a otimização CommonJS da geometria no Vite, o contraste do contador de ocorrências e do cabeçalho do modal, a mensagem de login cobrindo ações no celular e a falta de limpeza dos dados criados por testes. As rodadas finais repetiram os cenários com limpeza por API, sem liberar artificialmente viaturas ocupadas no código do produto.
