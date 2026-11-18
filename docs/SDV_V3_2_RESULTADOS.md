# SDV v3.2 — matriz de aceite e evidências

Esta matriz registra a entrega anterior. Para o refinamento de movimento, formulário e navegação, consulte os [resultados atualizados](SDV_REFINAMENTOS_V3_2_RESULTADOS.md).

Data: 2026-11-05. Código validado: `16b5e4710a3d39d47e1dd8a06584f29238f2ffca`.

**Resultado: 53 critérios PASSOU, 4 BLOQUEADO, 0 FALHOU.** Os 57 IDs vêm do plano v3.2. PASSOU significa execução no escopo indicado, incluindo fixtures explícitas; não significa homologação do provedor cartográfico real nem de infraestrutura AWS.

[Rodada completa do GitHub Actions](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) — os três jobs concluíram com sucesso. Foram aprovados lint, Prisma/migrations, build dos seis apps, seis testes unitários, integrações PostgreSQL/Redis e treze testes Playwright. O ciclo pela interface inclui ETA → criar → despachar → chegada → F5 com mesmo horário → encerrar → retomar patrulha.

[Capturas e artefatos ZIP](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692/artifacts/13392021727) (1.134.659 bytes, SHA-256 `5a44857ec0238364fb1524b94fadd3fa5f3a5cbe8db2271069ad5862bbe09784`; retenção informada pelo GitHub até 2027-02-03). Inclui 1366x768, 1440x900, 390x844, pin, perda de sinal, três despachos em cidade/bairro/rua e ciclo completo.

Trechos permanentes de logs, sem credenciais: [qualidade](evidence/v3/quality.log), [integração/E2E](evidence/v3/integration.log), [Terraform](evidence/v3/terraform.log). Os logs integrais permanecem na rodada do CI.

## Escopo cartográfico

PostgreSQL e Redis são reais. OSRM Table/Route, MapTiler e ViaCEP usam fixtures determinísticas no CI. As capturas possuem basemap de fixture e não comprovam cobertura real de ruas/endereços/CEPs do MapTiler. Uma consulta pontual ao OSRM público real retornou 44 pontos, 1.943,1 m e 199 s entre dois pontos de Feira de Santana; veja [registro do smoke](evidence/v3/osrm-real-smoke.log). Isso não homologa todas as rotas da cidade.

## Matriz dos 57 critérios

| ID | Status | Comando/teste | Evidência | SHA do código | Observação |
| --- | --- | --- | --- | --- | --- |
| AC-AUTH-01 | **PASSOU** | `tests/session.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | F5 após login |
| AC-AUTH-02 | **PASSOU** | `tests/websocket.spec.ts; tests/session.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | JWT curto expira de verdade no WS; refresh HTTP/WS sem logout |
| AC-AUTH-03 | **PASSOU** | `tests/session.mjs; tests/session.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Logout revoga refresh; reload não restaura |
| AC-AUTH-04 | **PASSOU** | `tests/session.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Sessão revogada volta ao login |
| AC-AUTH-05 | **PASSOU** | `tests/https.spec.ts; tests/session.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Cookie Secure/HttpOnly/Strict em TLS local; credenciais fora de storage |
| AC-AUTH-06 | **PASSOU** | `tests/session.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Duas abas e reload concorrente |
| AC-LOC-01 | **PASSOU** | `tests/operations.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | MapTiler mock com contexto de Feira de Santana |
| AC-LOC-02 | **PASSOU** | `tests/operations.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | ViaCEP mock; precisão aproximada explícita |
| AC-LOC-03 | **PASSOU** | `tests/operations.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Clique e drag do pin atualizam coordenadas |
| AC-LOC-04 | **PASSOU** | `tests/operations.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Submit bloqueado sem escolha e confirmação |
| AC-LOC-05 | **PASSOU** | `tests/operations.spec.ts; tests/operations.mjs` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Payload igual à prévia; persistência exata e transacional |
| AC-LOC-06 | **PASSOU** | `tests/operations.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | 503 no geocoding, fallback manual e cancelamento sem mutation |
| AC-LOC-07 | **PASSOU** | `tests/operations.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Fluxo completo em 390x844 |
| AC-MAP-01 | **PASSOU** | `tests/operations.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Mapa principal; banner ausente |
| AC-MAP-02 | **PASSOU** | `tests/scene.spec.ts; tests/renderer.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | SVG original com volume, cores e direção |
| AC-MAP-03 | **PASSOU** | `tests/renderer.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Amostras de frames efetivamente movem o marcador |
| AC-MAP-04 | **PASSOU** | `tests/renderer.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Projeção visual permanece nos segmentos da curva |
| AC-MAP-05 | **PASSOU** | `tests/scene.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Seleção e zoom preservado durante telemetria |
| AC-MAP-06 | **PASSOU** | `tests/scene.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Três despachos simultâneos com fator de teste controlado |
| AC-MAP-07 | **PASSOU** | `tests/gps.spec.ts; tests/gps.mjs` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Marcador congelado e sinal atrasado explícito |
| AC-MAP-08 | **PASSOU** | `tests/renderer.spec.ts; tests/scene.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Leitura funcional com prefers-reduced-motion |
| AC-MAP-09 | **BLOQUEADO** | `Configuração do provedor` | Pendente no provedor; testes com mocks no CI | `16b5e47` | Atribuição vem do estilo; restrição de chave/quota requer conta MapTiler real |
| AC-DIST-01 | **PASSOU** | `tests/concurrency.mjs; tests/operations.mjs; tests/race.mjs` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Unicidade no PostgreSQL, duas centrais e CAS |
| AC-DIST-02 | **PASSOU** | `tests/operations.mjs; tests/recovery.mjs` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | clientRequestId e reentrega sem duplicação |
| AC-DIST-03 | **PASSOU** | `tests/state.test.cjs; tests/websocket.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Versões antigas descartadas e reconnect autenticado |
| AC-DIST-04 | **PASSOU** | `npm run lint; npm test; npm run build; Playwright` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Qualidade e regressão completas no CI |
| AC-ETA-01 | **PASSOU** | `tests/operations.mjs; tests/lifecycle.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | OSRM Table sem reserva e ETA na prévia |
| AC-ETA-02 | **PASSOU** | `tests/operations.mjs; tests/lifecycle.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Rota/ETA do despacho persistido da viatura efetiva |
| AC-ETA-03 | **PASSOU** | `tests/operations.mjs; tests/gps.mjs` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | ETA original preservado; pausa/fator e sinal tratados |
| AC-TIME-01 | **PASSOU** | `tests/operations.mjs; tests/race.mjs` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | NO_LOCAL e chegadaEm no mesmo commit; CAS |
| AC-TIME-02 | **PASSOU** | `tests/operations.mjs; tests/lifecycle.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Replay e F5 mantêm o timestamp de origem |
| AC-TIME-03 | **PASSOU** | `tests/operations.spec.ts; tests/lifecycle.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Timeline com segundos, autoria, origem e intervalos |
| AC-GPS-01 | **PASSOU** | `tests/operations.mjs; tests/gps.mjs` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Heartbeat sem movimento; pausa conserva sinal |
| AC-GPS-02 | **PASSOU** | `tests/gps.mjs; tests/gps.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Sem GPS, posição/versão não avançam |
| AC-FLEET-01 | **PASSOU** | `tests/metrics.mjs` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Fronteira 02:59/03:00 UTC; concluídos separados de cancelados |
| AC-FLEET-02 | **PASSOU** | `tests/operations.mjs; tests/scene.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Turno persistido e detalhe da viatura |
| AC-PATROL-01 | **PASSOU** | `tests/operations.mjs; tests/routing-smoke.mjs` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Todas as livres avançam com turno; CI usa geometria fixture. Smoke OSRM real separado |
| AC-PATROL-02 | **PASSOU** | `tests/operations.mjs; tests/race.mjs` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Patrulha SUSPENSA no despacho e avanço condicionado ao estado |
| AC-PATROL-03 | **PASSOU** | `tests/operations.mjs; tests/lifecycle.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Encerramento libera e a posição volta a avançar |
| AC-PATROL-04 | **PASSOU** | `tests/race.mjs` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Duas réplicas e replay sobre o mesmo frame |
| AC-PATROL-05 | **PASSOU** | `tests/scene.spec.ts; tests/operations.mjs` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Rotas de patrulha não desenhadas em massa; elegibilidade por sinal/turno |
| AC-UI-01 | **PASSOU** | `tests/operations.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Largura do mapa >=65% em desktop |
| AC-UI-02 | **PASSOU** | `tests/accessibility.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Axe WCAG AA e tamanho mínimo no workspace |
| AC-UI-03 | **PASSOU** | `tests/operations.spec.ts; capturas` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Cinco KPIs compactos; painel integrado |
| AC-UI-04 | **PASSOU** | `tests/operations.spec.ts; tests/gps.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Estados indisponível/atrasado explícitos; métricas reais do banco |
| AC-QA-01 | **PASSOU** | `tests/lifecycle.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Ciclo inteiro pela UI, com F5, encerramento e retomada |
| AC-QA-02 | **PASSOU** | `tests/operations.mjs; tests/race.mjs; tests/recovery.mjs; tests/gps.mjs; tests/lifecycle.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Aceleração, pausa, GPS, crash, replay e centrais |
| AC-MAP-V3-01 | **BLOQUEADO** | `Configuração e fixtures MapTiler` | Pendente no provedor; testes com mocks no CI | `16b5e47` | Motor e adapter implementados; Dataviz real não homologado sem chave restrita |
| AC-MAP-V3-02 | **BLOQUEADO** | `Configuração e fixtures MapTiler` | Pendente no provedor; testes com mocks no CI | `16b5e47` | Tema alterna; legibilidade/cobertura real dos rótulos/ruas depende do provedor |
| AC-MAP-V3-03 | **PASSOU** | `tests/scene.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Cores/símbolos e rótulos por estado |
| AC-MAP-V3-04 | **PASSOU** | `tests/operations.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | 1366x768, 1440x900 e 390x844 |
| AC-MAP-V3-05 | **PASSOU** | `tests/renderer.spec.ts; tests/scene.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Interpolação e rota selecionada sem rondas em massa |
| AC-MAP-V3-06 | **PASSOU** | `tests/operations.spec.ts; tests/lifecycle.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Endereço/pin confirmado e ETA antes de registrar |
| AC-MAP-V3-07 | **PASSOU** | `tests/scene.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Contexto compacto e detalhe no painel |
| AC-MAP-V3-08 | **PASSOU** | `tests/gps.spec.ts; tests/gps.mjs` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Último sinal explícito e congelamento |
| AC-MAP-V3-09 | **BLOQUEADO** | `tests/accessibility.spec.ts; validação do provedor` | Pendente no provedor; testes com mocks no CI | `16b5e47` | Texto DOM AA passou; contraste dos rótulos no canvas Dataviz real não homologado |
| AC-MAP-V3-10 | **PASSOU** | `tests/scene.spec.ts` | [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692) | `16b5e47` | Capturas cidade/bairro/rua com três despachos; basemap mock explícito |

## Validações externas e limites

| Item | Status | Evidência / motivo |
| --- | --- | --- |
| MapTiler real: estilos, rótulos, cobertura de endereços/CEPs | **BLOQUEADO** | Não há chave pública restrita/conta de teste configurada. Os adapters e fluxos passaram com mocks. |
| Restrição por domínio, quota e custos MapTiler | **BLOQUEADO** | Exige configuração na conta do provedor; não foi contratada nem alterada nesta tarefa. |
| CloudFront/ALB/serviços AWS reais | **BLOQUEADO** | Nenhum recurso foi provisionado e nenhum deploy pago foi autorizado/executado. HTTPS foi validado com proxy TLS local. |
| Terraform fmt/init/validate | **PASSOU** | Job de infraestrutura no [CI](https://github.com/j0aoarthur/graphql-tde-sistemas-distribuidos/actions/runs/41976051692); não executa plan/apply. |
| FPS e dispositivos/GPU reais | **BLOQUEADO** | Chromium de teste comprova interpolação/curva e movimento reduzido; não certifica desempenho em todos os dispositivos. |

O bundler ainda informa aviso de chunk grande do mapa. Isso não foi convertido em aprovação de desempenho real.

## Falhas corrigidas durante a execução

- Contexto GraphQL com tipagem implícita e build copiando cliente Prisma antigo para diretório aninhado.
- Corrida de refresh entre abas/navegação e reconexão de WebSocket expirado.
- Sintaxe HCL que impedia init/validate; rota de sessão no CloudFront sem cache.
- Tipos numéricos/timestamps ambíguos no SQL do simulador e fixtures de métricas.
- Criação de marcador antes da coordenada, worker MapLibre no Vite e cancelamento indevido da animação por heartbeat.
- Contraste insuficiente e botão sem nome acessível; espaço excedente no desktop e ordem do mapa mobile.
- Seletores de autocomplete atualizados para opções acessíveis; cenário de três despachos com fator controlado.
- Teste de animação corrigido para o export CommonJS do ReactDOM.
- O teste de ciclo completo expôs contenção real: leitura Redis bloqueante atrasava Outbox/reconciliação. Agora o reader usa conexão separada; o ciclo completo passou sem afrouxar as asserções.

A documentação de execução e compatibilidade está em [SDV_V3_2_IMPLEMENTACAO.md](SDV_V3_2_IMPLEMENTACAO.md). Os PRs #3, #4 e #5 são encadeados sobre a branch executável. Não houve merge em main ou deploy AWS.
