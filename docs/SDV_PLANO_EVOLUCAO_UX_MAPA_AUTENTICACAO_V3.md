# SDV — Plano de evolução operacional de UX, mapa, ocorrências e autenticação (v3.1)

**Status:** planejamento v3.1 revisado a partir do código da Entrega Integrada v2 (ZIP anexado à conversa), não implementado neste PR.
**Data:** 04/11/2026
**Escopo:** painel exclusivamente ADMIN, múltiplas centrais via scripts, viaturas e movimento fictícios em ruas reais de Feira de Santana/BA, GraphQL Federation, Redis, PostgreSQL, AWS us-east-1, Single-AZ.
**Objetivo:** tornar o SDV uma central operacional de despacho, sem perder as garantias de sistemas distribuídos.

## 0. Estado do repositório e fontes da auditoria

Em 04/11/2026, a branch main do repositório público continha o site de apresentação, relatório técnico e docs; **o código da Entrega Integrada v2 ainda não estava publicado em main**. Esta revisão analisou o arquivo SDV_Entrega_Integrada_v2.zip fornecido na conversa. Para aplicar as alterações será preciso versionar esse baseline em branch de desenvolvimento, preservar os documentos originais e só então criar PRs por fase.

Arquivos-chave analisados no ZIP:
- apps/painel-frontend/src/App.tsx: autenticação, dashboard, formulários, menu e consultas.
- apps/painel-frontend/src/components/OperationsMap.tsx: Leaflet, seleção de coordenadas, marcadores e rotas.
- apps/painel-frontend/src/api.ts: snapshot GraphQL e evento WebSocket seguido de refetch.
- apps/ocorrencias-service/src/main.ts e src/schema.graphql: login JWT de 15 minutos, mutations e contrato de ocorrência.
- apps/ocorrencias-service/prisma/schema.prisma: colunas atuais, Admin, Central, Ocorrencia e Outbox.
- apps/gps-simulator/src/main.ts: OSRM, atualização periódica da localização e progressão de despachos.

## 1. Problemas comprovados no código

1. **Logout ao dar F5:** App.tsx inicializa token em useState('') e guarda apenas o accessToken retornado pela mutation login. Refresh da página zera o estado. O backend emite JWT de 15 minutos e não possui refresh de sessão.
2. **Seleção de localização ruim:** IncidentForm inicia point com coordenada fixa, envia essa localização até mesmo sem ação do usuário, não busca CEP/endereço e o modo pickMode do OperationsMap somente executa onPick: **não desenha pin da posição escolhida**.
3. **Visual da frota:** os veículos são divIcons do Leaflet com o emoji 🚓, sem direção visual nem rotação.
4. **Movimento “aos saltos”:** gps-simulator publica posições a cada aproximadamente 1.800 ms; React-Leaflet atualiza a posição do Marker sem interpolação quadro a quadro.
5. **Mapa raster genérico:** o TileLayer carrega tile.openstreetmap.org, sem controle visual do basemap ou renderização vetorial.
6. **Home pouco operacional:** a seção welcome-banner contém o CTA “Explorar mapa operacional” antes das métricas; o mapa é um componente secundário de tamanho limitado.
7. **Atualização redundante:** a subscription eventoSDV emite notificações que disparam getSnapshot de todas as coleções (também a cada 12 s). Falta atualização dirigida por entidade.
8. **Contrato mínimo:** Ocorrencia só contém tipo, prioridade, coordenadas, central/status, IDs e timestamps. Não há endereço, CEP, bairro, descrição, referência ou origem da seleção.

## 2. Decisões de produto

- A **home será a Central Operacional**, com mapa dominante e operação visível imediatamente, sem hero/banner, slogan promocional ou CTA “Explorar mapa”.
- A aba “Mapa Operacional” pode ser absorvida pela home; se mantida, será uma visualização ampliada do **mesmo componente de mapa**, sem duplicação de lógica.
- O formulário de nova ocorrência disponibilizará **duas formas equivalentes** de escolher o ponto: (A) pesquisar endereço, bairro, estabelecimento ou CEP; (B) clicar no mapa e depois ajustar o pin. As duas alimentarão o mesmo estado de localização.
- Uma ocorrência não pode ser registrada sem **ponto explicitamente escolhido e confirmado**. Nada de usar coordenadas pré-selecionadas sem informar o usuário.
- O operador poderá ver um **pin grande, arrastável, sempre visível**, um cartão com endereço/referência e uma prévia do contexto viário antes de confirmar.
- O backend preservará a semântica de despacho seguro já existente; a melhoria do mapa não mudará a autoridade transacional do PostgreSQL.
- O GPS será simulado, mas a UI não deve parecer um laboratório: controles técnicos irão para uma seção de Administração/Diagnósticos com acesso ADMIN.

## 3. Proposta para o mapa: MapLibre GL JS + MapTiler

**Recomendação:** substituir React-Leaflet/Leaflet do mapa principal por **MapLibre GL JS** com mapas vetoriais do MapTiler. Tema padrão **Dataviz Light** (tons neutros, vias legíveis, ocorrências em vermelho e viaturas em verde/azul), alternância opcional para Dataviz Dark e um estilo Streets para situações em que mais nomes de ruas sejam necessários. O estilo deve ser configurável via variável de ambiente, nunca fixo em um componente.

Por quê:
- Renderização vetorial com controle da cor e do nível de detalhe das vias, rótulos e POIs.
- Marcadores personalizados, orientação por ângulo e atualizações por requestAnimationFrame.
- Melhor contraste entre mapa, veículos e ocorrências.
- Evita que a API de mapa fique acoplada à lógica de negócio.

Alternativas:
- **Mapbox GL JS + Mapbox:** experiência rica e estilo ajustável, porém cobrança/contrato de provedor e mais dependência de fornecedor.
- **Google Maps JavaScript + Places:** UX familiar e boa pesquisa, mas custos adicionais, APIs/quotas e condições específicas para dados Google Places em outros mapas.
- **Leaflet + tiles pagos:** migração pequena e custo possivelmente menor, mas menos conveniente para renderização de viaturas rotacionadas e animações vetoriais em larga escala.

**Não usar tiles raster públicos do OSM como base para produção com disponibilidade esperada.** A OSM Foundation não oferece SLA e impõe política de consumo. Também não usar o Nominatim público para autocomplete.

Provedor de mapas e geocoding deve possuir interface/adapter, chave restrita por origem e observabilidade de consumo. **Créditos AWS não pagam automaticamente os serviços de mapa de terceiros.** Confirmar limites e quotas do plano escolhido antes do deploy.

## 4. Novo fluxo de localização na abertura

### 4.1 Layout

- Desktop: painel amplo, preferencialmente drawer modal de 90–95vw, mapa à direita (aprox. 60–65%), formulário e localização à esquerda (aprox. 35–40%). Altura útil sem scroll no mapa; formulário pode ter scroll independente.
- Mobile: mapa com altura útil e **bottom-sheet** para campos/resultados, sem esconder o marcador durante a seleção.
- Mapa centralizado inicialmente na cidade, **sem local confirmado** e com CTA desabilitado até escolha explícita.
- Campos: tipo, prioridade, descrição curta obrigatória, referência opcional, observações opcionais, endereço legível, bairro, CEP opcional e coordenadas técnicas em área secundária.

### 4.2 Modo A — busca

- Campo único “Busque CEP, rua, número, bairro ou local em Feira de Santana”.
- Debounce de 300–400 ms, cancelamento de pedidos obsoletos, loading, mensagem “nenhum resultado” e suporte a teclado.
- Geocoding MapTiler com country=BR, proximity em Feira de Santana e bbox municipal quando apropriado. **Testar cobertura real de ruas, números e CEPs da cidade antes de fechar o provedor.**
- CEP brasileiro: normalizar 8 dígitos; ViaCEP para **texto de logradouro/localidade**, seguido de geocoding para coordenadas. CEP pode abranger um trecho ou região: nunca indicar precisão “porta exata” sem evidência.
- Ao escolher sugestão: mover mapa com animação suave, colocar pin no centro do resultado, mostrar cartão de localização e nível de precisão, permitir corrigir pelo pin.
- Geocoding reverso ao ajustar manualmente a posição. Se indisponível, apresentar coordenadas e permitir descrição/referência manual.

### 4.3 Modo B — pin

- Clique no mapa: pin aparece imediatamente, animação discreta de entrada, marcador **arrastável** e cartão de confirmação.
- Arrastar pin atualiza coordenadas e resolve endereço novamente ao finalizar o arraste, não em todo pixel.
- Botão “Ajustar localização” retorna ao modo de edição; “Confirmar local” marca o ponto como explicitamente confirmado.
- Antes de criar ocorrência, mostrar resumo: endereço + referência, tipo e prioridade; opção de retornar para ajustar o local.
- Formulário não pode disparar mutation enquanto localização não estiver confirmada, mesmo que coordenadas internas tenham valor.

### 4.4 Contrato e banco

Estender Ocorrencia/AbrirOcorrenciaInput, mantendo campos existentes:
- descricao: string (obrigatória, tamanho validado).
- enderecoFormatado: string (pode ser vazio se busca reversa falhar, mas requer referência alternativa).
- cep, bairro, numero, complemento, referencia: strings opcionais.
- origemLocalizacao: enum ENDERECO | CEP | PIN.
- precisaoLocalizacao: enum PONTO | APROXIMADA.
- latitude/longitude continuam como campos obrigatórios, validados no servidor.
- Ponto e metadados têm de ser persistidos **na mesma transação** da Ocorrencia e da Outbox; chave clientRequestId existente permanece.
- Migration Prisma e compatibilidade com dados legados: descrição default apenas na migração ou backfill explícito; no novo input deve ser obrigatória.
- Verificação de limites e sinalização se o ponto estiver fora da área de operação definida.

## 5. Home redesenhada como Central Operacional

**Desktop (prioridade):**
- Sidebar de navegação compacta e topbar de baixa altura.
- Mapa ocupa pelo menos 60–70% da área principal visível, com altura próxima à viewport disponível.
- Painel lateral **integrado ao layout**, nunca uma cobertura escura do mapa, contendo abas “Em andamento”, “Aguardando” e “Viaturas”.
- Barra superior de indicadores compactos: ocorrências ativas, aguardando, viaturas livres, viaturas em deslocamento, sem sinal.
- Sobre o mapa: controles para zoom, centralizar frota, alternar camada Light/Dark, seleção de viatura, filtro e exibição de rotas.
- Botão principal “Nova ocorrência” sempre visível.
- Ao selecionar ocorrência: destacar pin de destino, rota e viatura associada; painel mostra prioridade, endereço, status, horário, ETA e ações.
- Ao selecionar viatura: mostrar ícone/placa, status, última posição, destino e rota ativa. Modo “Acompanhar” é opcional; não forçar auto-recentro depois que o operador mover o mapa.
- Rotas múltiplas discretas; rota selecionada realçada, trajeto percorrido esmaecido e trecho restante destacado.

**Mobile:** mapa ocupa a maior parte da tela, com lista em bottom-sheet expansível. Atalhos de ação fixos com área segura; nenhuma barra que esconda a rota.

**Remover:** welcome-banner, radar decorativo, CTA “Explorar mapa operacional” e subtítulos promocionais. Reduzir duplicação de mapa entre “Visão geral” e “Mapa operacional”.

## 6. Viaturas em movimento como Uber/99

- Usar **ícone SVG original de carro/viatura em vista superior**, com sombra sutil, anel de seleção e cor de status. Não copiar imagens ou marcas de Uber/99.
- Animação visual em requestAnimationFrame (alvo 60 fps em dispositivo compatível); o backend continua enviando posições discretas com timestamps e versões.
- Interpolar a posição **ao longo da polilinha OSRM**, não entre dois pontos como linha reta que atravessa quarteirões.
- Calcular heading/bearing pelo segmento da rota, girar veículo com suavização angular, respeitando curvas e sentidos de via.
- Fonte da verdade: latitude/longitude, versão e atualizadoEm do servidor. Guardar último ponto confirmado, progresso e rota; descartar eventos antigos/fora de ordem.
- Latência: amortecimento visual curto entre atualizações, sem inventar deslocamento indefinidamente. Se não houver nova posição em 10–15s, marcar “localização desatualizada”, parar previsão visual ou congelar após janela controlada; ao reconectar, reconciliar com o ponto verdadeiro.
- Permitir pausar/analisar e retomada; chegada precisa preservar estado NO_LOCAL e não liberar a viatura automaticamente.
- Otimizar com React.memo/GeoJSON layers e não reinstanciar toda a árvore de marcadores ou dar fitBounds a cada atualização.
- Respeitar prefers-reduced-motion e permitir visualização estática.

## 7. Eventos GraphQL de granularidade fina

Atualmente eventoSDV é apenas aviso e dispara refresh do snapshot inteiro. Evoluir sem remover o fallback:
- Query inicial por área: viaturas, ocorrências ativas e despachos ativos.
- Eventos/versionamento: ViaturaAtualizada (id, latitude, longitude, heading, versao, atualizadoEm, status), OcorrenciaAtualizada e DespachoAtualizado.
- Redis Pub/Sub continua transitório; ao reconnect/subscription reestabelecida, **consultar estado persistido**, comparar versões e aplicar divergências.
- Gerenciar reconexão exponencial com jitter, estados de rede e mudança de credenciais; não atualizar UI como “online” apenas por receber uma conexão superficial.
- Fazer snapshots de reconciliação com intervalo maior e após retorno de conexão; separar queries por entidade e viewport para evitar refetch geral a cada posição.
- Garantir que duas centrais mostrem a mesma versão de um despacho, embora a animação visual possa diferir por quadros.

## 8. Correção da autenticação: P0 antes do redesenho

### 8.1 Falha confirmada

App.tsx inicializa token com useState(''); login somente chama setToken(accessToken). Recarregar perde o estado e envia o usuário ao login. O resolver login em ocorrencias-service gera JWT válido por 15 minutos, mas não há refresh token persistido, cookie de sessão nem bootstrap de autenticação.

### 8.2 Solução

- Access token JWT curto (15 min), **armazenado apenas em memória**; refresh token opaco aleatório, persistido **somente como hash** no PostgreSQL, rotacionado e revogável.
- Cookies de refresh **HttpOnly, Secure, SameSite=Lax/Strict conforme fluxo testado, Path apropriado**, sem localStorage/sessionStorage para credenciais.
- Endpoint de sessão no Gateway/BFF na **mesma origem HTTPS do frontend**, para emitir/renovar/revogar refresh cookie; domínio funcional continua federado via GraphQL. Alternativamente, se for exigido GraphQL em todas as operações, encaminhar com cuidado Set-Cookie do subgraph através do Gateway.
- Infra CloudFront: encaminhar /auth/* sem cache, com cookies necessários e sem cachear Set-Cookie; /graphql e /subscriptions também devem respeitar roteamento e controle de cache apropriados.
- Fluxo app: estado inicial “restaurando sessão” (não mostrar login por engano), POST /auth/refresh com credentials: include, verificar /me, renderizar painel; diante de 401 renovar uma única vez e repetir requisição; em falha definitiva limpar credenciais e mostrar login.
- Single-flight refresh em chamadas concorrentes; rotação segura para abas simultâneas; revogação em logout e invalidar cookie.
- Proteções adicionais: Origin/CSRF, proteção contra reutilização de refresh token, rate limit de login, trilha de autenticação, testes com proxy HTTPS.
- Opção “lembrar dispositivo” pode controlar duração da sessão, sem preservar senhas no browser.

## 9. Organização recomendada do código

Dividir App.tsx (~46 KB hoje) em:
- src/features/auth/: AuthProvider, SessionBootstrap, hooks, login/logout/refresh.
- src/features/operations/: OperationsWorkspace, OperationsSidebar, KPI compactos, selectors.
- src/features/incidents/: CreateIncidentDrawer, LocationPicker, AddressSearch, IncidentDetails.
- src/features/fleet/: VehicleMarker, VehicleAnimationController, VehicleDetails.
- src/features/dispatch/: RouteLayer, DispatchDetails, ETA.
- src/components/map/: MapShell, MapProviderAdapter, MapControls, MapLayers.
- src/graphql/: operações tipadas via codegen, hooks e cache.
- src/design-system/: botão, status, modal, drawer, toast, form fields.

Deixar adaptadores de geocoding, basemap e roteamento separados: **MapTiler para base/endereço, OSRM para rota viária, PostgreSQL para estado da viatura e GraphQL para comunicação com o painel**.

## 10. Fases, entregáveis e dependências

| Fase | Prioridade | Entregável | Dependências |
|---|---|---|---|
| 0 | P0 | Importar baseline v2 do ZIP para branch e reproduzir build/local; testes de fumaça | GitHub agora com escrita; ambiente Node/Docker |
| 1 | P0 | Sessão persistente e segura com refresh | Backend auth, banco e CloudFront |
| 2 | P0 | Novo MapShell vetorial + tema visual | Chave provedor de mapas com limite de uso |
| 3 | P0 | Criar ocorrência via endereço/CEP ou pin com prévia e confirmação | Geocoding escolhido e migration |
| 4 | P0 | Novo workspace inicial map-first, sem banner | MapShell e novos componentes |
| 5 | P0 | Ícones SVG, heading e movimento interpolado | Route geometry e eventos versionados |
| 6 | P1 | Subscriptions incrementais, cache e ressincronização | Contratos GraphQL |
| 7 | P1 | Refinar detalhes, busca, filtros, ETA, fila e estados sem sinal | UI + APIs |
| 8 | P0 | Testes E2E, regressão concorrente, responsividade e deploy | Pipeline + AWS us-east-1 |

**Não mudar agora** a arquitetura Single-AZ da AWS nem a lógica de escolha/lock de viaturas por conveniência visual. Evoluções no despacho manual/ETA como critério de escolha podem ser backlog distinto.

## 11. Critérios de aceite

**Sessão**
- AC-AUTH-01: F5 segundos depois do login mantém a central autenticada após restauração da sessão.
- AC-AUTH-02: Access token expirado é renovado automaticamente, inclusive após reconexão WebSocket.
- AC-AUTH-03: Logout revoga refresh token; F5 após logout não autentica novamente.
- AC-AUTH-04: Sessão expirada/revogada exibe login e não deixa painel aparentemente conectado.
- AC-AUTH-05: Nenhum JWT ou refresh token aparece em localStorage/sessionStorage; cookies têm flags seguras.
- AC-AUTH-06: Múltiplas abas não provocam loops de renovação ou logout indevido.

**Ocorrências**
- AC-LOC-01: Busca por rua/endereço retorna sugestões com contexto de Feira de Santana; seleção mostra pin.
- AC-LOC-02: Busca por CEP de 8 dígitos preenche endereço quando disponível e informa que ponto pode ser aproximado.
- AC-LOC-03: Clique no mapa mostra pin imediatamente; arraste atualiza prévia, endereço e coordenadas.
- AC-LOC-04: Sem seleção explícita + confirmação, botão “Registrar ocorrência” fica indisponível.
- AC-LOC-05: Ao salvar, coordenadas e metadados persistidos correspondem exatamente à prévia confirmada.
- AC-LOC-06: Cancelar modal não cria ocorrência; erros de geocoding permitem continuar via pin/referência.
- AC-LOC-07: Mobile permite buscar, escolher, corrigir pin e confirmar sem controles sobrepostos.

**Mapa**
- AC-MAP-01: Após login, o componente principal da página inicial é o mapa; welcome-banner/CTA ausentes.
- AC-MAP-02: Viaturas representadas por SVG original de carro, rotação coerente com a rota e cores de status.
- AC-MAP-03: Deslocamento visual interpolado entre posições, sem saltos visíveis normais para dados atualizados.
- AC-MAP-04: Viatura fica sobre a geometria da rua em curvas; não atravessa quarteirões ao interpolar.
- AC-MAP-05: Seleção destaca veículo, ocorrência e rota; não reposiciona automaticamente o mapa em todos os eventos.
- AC-MAP-06: Três despachos simultâneos permanecem visíveis, com rotas distintas e atualização independente.
- AC-MAP-07: Ao perder telemetria, UI informa atraso e para de mostrar movimento falso após timeout.
- AC-MAP-08: Em prefers-reduced-motion, a leitura permanece funcional sem animação forçada.
- AC-MAP-09: O mapa mantém atribuição e respeita regras do provedor; chaves têm restrição de domínio.

**Distribuídos/regressão**
- AC-DIST-01: Duas centrais simultâneas não conseguem vincular a mesma viatura a dois despachos ativos.
- AC-DIST-02: Reenvio da mesma mutation com clientRequestId não duplica ocorrência.
- AC-DIST-03: Reconnect ou evento fora de ordem não faz estado regredir.
- AC-DIST-04: A entrega mantém build, lint, testes unitários e E2E de login/localização/mapa.

## 12. Critérios de conclusão da entrega

A fase é considerada concluída apenas depois de:
1. Código versionado em PRs isolados; main protegida e sem commit direto.
2. Testes React/Playwright para criação por endereço, CEP e pin, renovação de sessão e acompanhamento de viaturas.
3. Testes de integração GraphQL + banco + Redis, incluindo concorrência e reconciliação.
4. Revisão visual desktop e mobile (incluindo 1366x768 e 390x844), legibilidade e acessibilidade.
5. Teste de uso do geocoding com dados reais e diversos endereços/CEPs de Feira de Santana.
6. CloudFront/ALB HTTPS e rotas de autenticação testados antes da publicação.
7. Relatório de custos de MapTiler (ou provedor escolhido), AWS CloudWatch e limites de consumo configurados.
8. Nenhuma alegação de produção ou homologação antes da execução efetiva.

## 13. Referências externas verificadas

- MapLibre GL JS — documentação de animação de Marker: https://maplibre.org/maplibre-gl-js/docs/examples/animate-a-marker/
- MapTiler — Map styles / Dataviz Light e Dark: https://docs.maptiler.com/sdk-js/api/map-styles/
- MapTiler — Geocoding e autocomplete: https://docs.maptiler.com/cloud/api/geocoding/
- ViaCEP — CEP sem coordenadas garantidas: https://viacep.com.br/
- OSM — Tile usage policy: https://operations.osmfoundation.org/policies/tiles/
- OSM — Nominatim policy (autocomplete público proibido): https://operations.osmfoundation.org/policies/nominatim/
- OWASP — Session Management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet
- AWS CloudFront — Cookie forwarding: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Cookies.html


---

# Aditivo v3.1 — Telemetria contínua, ETA, histórico auditável e redesign visual de alto contraste

**Data:** 04/11/2026  
**Estado:** requisitos e diagnóstico de código aprovados para planejamento; a implementação abaixo ainda não foi realizada.  
**Compatibilidade:** complementa as fases 0–8 acima; resolve campos faltantes e modifica o motor de movimento para patrulhamento contínuo.

## 14. Diagnóstico técnico dos campos vazios

Auditoria realizada sobre **SDV_Entrega_Integrada_v2.zip**, não sobre uma aplicação executada. A branch main ainda contém documentos e apresentação, sem o backend publicado.

| Campo reclamado | Causa verificada | Fonte no ZIP | Classificação |
| --- | --- | --- | --- |
| Último sinal de GPS | \`Viatura.atualizadoEm\` é \`@updatedAt\`, uma modificação genérica da entidade. O simulador atualiza esse valor ao mover viaturas despachadas, mas disponíveis não recebem heartbeat. Uma mudança de status também pode alterar esse valor. | \`viaturas-service/prisma/schema.prisma\`; \`gps-simulator/src/main.ts\` | Sem modelo de telemetria específico |
| Chegada ao local com horário real | Quando \`progresso===1\`, o simulador atualiza \`Despacho.status = NO_LOCAL\` e \`Viatura.status = NO_LOCAL\`, emite \`VIATURA_CHEGOU\`, mas **não grava data de chegada**. O frontend renderiza apenas texto "Viatura posicionada no destino". | \`gps-simulator/src/main.ts\`; \`painel-frontend/src/App.tsx\` | Não persistido |
| Dados completos de cada passo da timeline | Não há tabela de eventos da ocorrência/despacho. A timeline é sintetizada no React com \`criadoEm\`, \`despacho.criadoEm\` e \`ocorrencia.atualizadoEm\`. Este último é a última edição geral e não representa cada evento histórico. | \`ocorrencias-service/prisma/schema.prisma\`, \`App.tsx\` | Histórico de domínio ausente |
| Ocorrências da viatura no dia | \`listarDespachos\` retorna até 400 linhas, sem filtro de período ou agregação por viatura; nenhuma query de contagem diária. | \`viaturas-service/src/main.ts\`, \`viaturas-service/src/schema.graphql\` | Query e indicador ausentes |
| Desde quando opera | A entidade Viatura não possui turno, início do serviço ou sessões operacionais; \`criadoEm\` não é um substituto correto para início de turno. | \`viaturas-service/prisma/schema.prisma\` | Modelo ausente |
| Duração / ETA | \`duracaoSegundos\` pode ser nulo até o simulador chamar OSRM **após** alocação; \`App.tsx\` apresenta "Calculando". Não há consulta de ETA na prévia da criação. | \`gps-simulator/src/main.ts\`, \`App.tsx\` | Dependência assíncrona e UX sem estado explícito |
| Viaturas disponíveis paradas | O simulador consulta somente despachos \`CONFIRMADO\`/\`EM_DESLOCAMENTO\`; não há fluxo que atualize posições de \`Viatura.status=DISPONIVEL\`. | \`gps-simulator/src/main.ts\` | Patrulhamento não implementado |
| Texto diminuto e pouco contraste | CSS usa corpo raiz 14 px, labels e detalhes frequentemente 9–11 px; cor secundária muito clara; há muitos rótulos monospace, versais e tracking. Apesar de \`DM Sans\`/\`Manrope\` já serem **sem serifa**, escala e estilo fazem o texto parecer pouco legível. | \`painel-frontend/src/style.css\` | Design tokens e densidade |

**Regra:** nunca preencher dados inexistentes com valores estimados apresentados como históricos. Campos legados sem evidência mostram "Não registrado" com explicação.

## 15. ETA desde a seleção da ocorrência

**Nova query somente leitura** \`preverDespacho(latitude,longitude)\`, retornando:
- \`calculadoEm\`, \`viaturaCandidataId\`, \`distanciaMetros\`, \`duracaoViariaSegundos\`, \`origemEstimativa\` (OSRM) e \`qualidadeEstimativa\` (ROTEAVEL/INDISPONIVEL).
- A query calcula duração usando OSRM **Table Service** (matriz de viaturas elegíveis → ocorrência), podendo usar ranking Haversine como pré-filtro para reduzir custo. Não realiza reserva de viatura.
- Tratar ponto fora de área, rota inacessível e falha OSRM sem criar falsa previsão. Exibir "Sem previsão" quando não houver viaturas.
- Debounce no mapa: só recalcular depois que o usuário parar de mover pin/confirmar busca; cancelar resposta obsoleta.
- Prévia mostra "Viatura provável", "Chegada estimada" e "Distância por rua", sempre com aviso de que o candidato pode mudar até o commit.

**Após alocação:** persistir previsão inicial vinculada ao despacho e calcular geometria da rota da viatura realmente alocada. Guardar:
- \`etaOriginalSegundos\`, \`previsaoGeradaEm\`, \`previsaoChegadaEm\`, \`distanciaInicialMetros\`, \`versaoPrevisao\`;
- \`etaAtualSegundos\`, \`previsaoAtualizadaEm\` para atualizações derivadas da rota restante;
- \`origemDados = SIMULACAO\` e \`fatorSimulacaoAplicado\` quando aplicável.

**Dois relógios diferentes:**
1. \`duracaoViariaSegundos\`: duração que o OSRM estima para a malha viária, sem previsão de trânsito ao vivo.
2. \`tempoDecorridoRealSegundos\`: diferenças entre timestamps **efetivamente gravados pelo servidor** durante a execução, inclusive com a simulação acelerada.

Quando o fator 12x estiver ligado, o ETA de chegada em tempo de parede terá de considerar o fator e as pausas, sem rotular duração simulada como tempo de atendimento real na cidade. Mostrar "Estimativa viária" e "Chegada prevista na simulação" separadamente quando a aceleração estiver ativa. Reestimar após alteração de fator, pausa ou desvio.

## 16. Timestamps de chegada, atendimento e linha do tempo de verdade

### Persistência canônica

No banco **Viaturas** (dono da alocação):
- \`Despacho.despachadoEm\` (pode inicialmente ser equivalente ao commit/criadoEm, mas persistido semanticamente),
- \`Deslocamento.iniciadoEm\` ou \`Despacho.saidaEm\`,
- \`Despacho.chegadaEm\` **TIMESTAMPTZ nullable**, preenchido exatamente uma vez, no **mesmo commit** que move o despacho a \`NO_LOCAL\`;
- \`Despacho.concluidoEm\`, \`distanciaMetros\`, histórico de previsões se necessário;
- Outbox \`VIATURA_CHEGOU\` incluindo \`eventId\`, \`despachoId\`, \`ocorrenciaId\`, \`viaturaId\`, \`chegadaEm\` e \`versao\`.

No banco **Ocorrências** (dono do histórico da ocorrência):
- Modelo \`EventoOcorrencia\`: \`id\`, \`ocorrenciaId\`, \`tipo\`, \`ocorridoEm\` (timestamp de origem), \`registradoEm\` (timestamp da ingestão), \`origemServico\`, \`eventIdOrigem\` UNIQUE, \`adminId\` opcional, \`centralId\` opcional, \`descricao\`, \`metadados\` JSON restrito.
- Consumer idempotente recebe a Outbox, persiste \`EventoOcorrencia\` e atualiza projeção status; **nunca substitui \`chegadaEm\` pelo horário em que recebeu a mensagem**, mesmo sob atraso de rede ou reentrega.
- Eventos de exemplo: OCORRENCIA_CRIADA, TRIAGEM_CONCLUIDA, VIATURA_DESPACHADA, ROTA_CALCULADA, DESLOCAMENTO_INICIADO, VIATURA_CHEGOU, ATENDIMENTO_CONCLUIDO, CANCELAMENTO_SOLICITADO, OCORRENCIA_CANCELADA, SINAL_PERDIDO/RESTABELECIDO (quando relevante). Histórico técnico interno continua separado da timeline operacional para evitar poluição.
- Testar UPSERT/reentrega e consistência eventual entre bancos. Timestamps armazenados UTC e exibidos em **America/Bahia** com data e segundos.

### Indicadores derivados, não preenchidos manualmente

- \`tempoNaFilaSegundos = despachadoEm - criadoEm\`
- \`tempoDeDeslocamentoObservado = chegadaEm - saidaEm\`
- \`tempoAteChegada = chegadaEm - criadoEm\` (**tempo real decorrido da execução da simulação**, não tempo de uma ambulância real)
- \`tempoAtendimentoObservado = concluidoEm - chegadaEm\`
- \`erroPrevisaoSegundos = tempoDeDeslocamentoObservado - etaOriginalSegundosAjustadoAoFator\`; exibir contexto quando simulação for pausada/acelerada.

Na interface, timeline mostra **data, hora: minuto: segundo**, autor/origem, viatura, ETA da etapa, tempo desde o passo anterior e metadados somente quando existirem. Nenhum timestamp derivado de \`atualizadoEm\` para retroagir eventos anteriores.

## 17. Último sinal e estado operacional das viaturas

### Campo certo, interpretação certa

Criar em Viatura:
- \`ultimoSinalEm\`: recebimento de telemetria/heartbeat efetivo;
- \`ultimaPosicaoEm\`: momento em que a coordenada foi medida;
- \`ultimoMovimentoEm\`: último deslocamento com distância observável;
- \`velocidadeMps\`, \`direcaoGraus\`, \`versaoPosicao\`;
- \`atualizadoEm\` permanece auditoria de alteração do registro, **não é a fonte de GPS**.

Backend recebe heartbeat mesmo se veículo estiver estacionado. Exibir:
- \`sinal OK\` se telemetria recente, \`Atrasado\` se ultrapassar limiar configurado, \`Sem sinal\` se exceder timeout;
- horário absoluto: "Último sinal 15:21:07"; hora relativa: "há 4 segundos";
- posição obsoleta permanece na última coordenada conhecida, com estilo específico; não inventar movimento se conexão estiver perdida.

Limiar inicial proposto: warning com 10 s, offline com 30 s para cadência de 2 s (parametrizável). Diferenciar \`viatura disponível\` de \`GPS sem sinal\` e de \`patrulhamento pausado\`; GPS offline pode tornar viatura inelegível para despacho automático conforme política configurada, sem alterar status indevidamente.

### Serviço operacional / turno

Criar \`TurnoViatura\` (\`id\`, \`viaturaId\`, \`inicioEm\`, \`fimEm\`, \`iniciadoPor\` SCRIPT/SISTEMA/ADMIN, \`status\`). Nesta versão sem motorista: ativação de turno por seed/script ou comando administrativo já autorizado. \`operandoDesde\` = início do turno **ativo**, não criação do registro nem primeiro GPS. Se não existir turno, mostrar "Turno não iniciado" ou "Histórico indisponível"; não inventar.

### Ocorrências da viatura no dia

Não contar registros em memória nem depender da lista limitada a 400. Query dedicada \`estatisticasViatura(id,dataLocal)\` no serviço de Viaturas, com janela do dia em **America/Bahia**, convertida a UTC:
- \`despachosIniciadosHoje\`: despachos confirmados na janela local;
- \`atendimentosConcluidosHoje\`: despachos concluídos na janela;
- \`tempoTotalEmDeslocamentoHoje\` somente por timestamps disponíveis;
- \`operandoDesde\`, \`duracaoTurno\`, \`ultimoSinalEm\`, \`situacaoSinal\`.

Se houver eventos cancelados, não agrupá-los como atendimentos concluídos. Paginação para histórico: \`despachosViatura(id,cursor,limit)\`.

## 18. Viaturas livres patrulhando a cidade, 24/7 enquanto turno ativo

**Nova regra obrigatória:** uma viatura \`DISPONIVEL\` permanece **em patrulhamento**, deslocando-se por ruas reais de Feira de Santana, com rota OSRM calculada entre pontos válidos. Uma viatura \`OCUPADA\` segue a rota da ocorrência e uma \`NO_LOCAL\` fica estacionada até encerramento.

Não confundir a condição de disponibilidade (\`DISPONIVEL\`) com o modo de movimento (\`PATRULHAMENTO\`, \`DESLOCAMENTO_OCORRENCIA\`, \`PARADA\`). A viatura pode estar disponível enquanto patrulha.

### Motor de patrulhamento

- Introduzir \`Patrulha\` (ou \`TrajetoPatrulha\`) com \`viaturaId\`, \`rota\` GeoJSON/linhas OSRM, \`origem\`, \`destino\`, \`progresso\`, \`versao\`, \`inicioEm\`, \`fimEm\` e \`status\`.
- Gerar destinos em zonas urbanas pré-aprovadas e roteáveis de Feira de Santana; snap à via, controle de área, velocidade e rejeição de rotas impossíveis. **Não** gerar ponto aleatório fora de vias, teletransporte ou trajetos em linha reta.
- Ao concluir uma rota de ronda, gerar uma próxima rota a partir da posição atual. Para não sobrecarregar OSRM, usar cache de rotas e recalcular somente quando necessário.
- Atualizar o PostgreSQL com CAS por \`versaoPosicao\` ou lease com fencing para impedir dois simuladores de avançarem o mesmo veículo em réplicas concorrentes.
- **Transição atômica para despacho:** somente se \`Viatura.status = DISPONIVEL\`, reservar recurso e suspender patrulha no mesmo commit de viatura/despacho. O simulador de ronda usa UPDATE condicional status DISPONIVEL + versão para não continuar a mover um carro após ser despachado.
- O despacho parte **da posição confirmada mais recente**, não da origem do seed ou do início do segmento de ronda. Pausas/falhas não podem redefinir coordenadas.
- Após concluir atendimento e liberar viatura, iniciar nova rota de patrulha **da posição do encerramento**.
- Em \`NO_LOCAL\`, exibir ícone parado e chegada com timestamp. Em \`DISPONIVEL\` + \`PATRULHAMENTO\`, exibir ícone móvel verde e "Em patrulha".
- Em zoom geral, mostrar ícones de todas as viaturas, mas **não desenhar todas as rotas de patrulhamento simultaneamente**. Mostrar só trajetos ativos de ocorrências e rota da viatura selecionada, para não poluir o mapa.

**Movimento visual:** MapLibre anima ícone SVG do carro usando \`requestAnimationFrame\`, interpolando de maneira suave **sobre a geometria OSRM**, rotacionando \`bearing\`. Telemetria continua discreta com timestamp/versionamento. Na perda de sinal, congelar o marcador depois da janela máxima de interpolação e sincronizar com estado canônico ao reconectar.

## 19. Redesign — mais contraste, tipografia legível, mapa dominante, menos ruído

Diagnóstico: \`DM Sans\` e \`Manrope\` no CSS **já são sans-serif**. O problema percebido vem principalmente de escala 9–11 px, rótulos todos em caixa alta/monoespaçados e textos cinza-claros, não da existência de serifa. Evitar aumentar simplesmente o número de cards.

### Direção visual

- **Fonte principal:** \`Inter\` (ou IBM Plex Sans) em todas as telas, sem mistura de famílias display. Fonte mono restrita a IDs, placas e dados técnicos; cabeçalhos em frase normal, sem tracking excessivo.
- **Escala:** corpo 16 px desktop e 15–16 px mobile; labels secundários 13–14 px; tabela 14 px; inputs 15–16 px; título de página 26–30 px; títulos de painel 18–22 px; métricas 24–30 px. Evitar 9–11 px para texto funcional.
- **Paleta inicial:** texto \`#172534\`, secundário \`#475569\`, fundo \`#EDF1F5\`, cards \`#FFFFFF\`, borda \`#BAC6D2\`, alerta \`#C83335\`, viatura livre \`#08735A\`, selecionado \`#235FA4\`. Validar contrastes reais em todas as combinações: WCAG AA >= 4.5:1 para texto normal e >= 3:1 para texto grande.
- Mais contraste **sem virar um dashboard quase preto**: superfícies bem definidas, ações fortes, alerta vermelho só em prioridades e exceções. Ícones sempre com rótulo no painel.
- MapLibre/MapTiler com estilo urbano de vias legíveis, densidade de POIs reduzida. Rota selecionada visualmente dominante; outras rotas discretas.
- **Alto aproveitamento de tela:** topbar 56–64 px; sidebar compacta recolhível; mapa 65–72% da largura de trabalho, até o fim da viewport; painel de operação à direita com largura adaptativa ~320–400 px e scroll próprio.
- KPIs **uma linha compacta**, no máximo 4–5 indicadores (ativas, aguardando, patrulhando/disponíveis, deslocando, sem sinal). Nada de banners, cards decorativos, fundos sem conteúdo ou duplicidade da tela "Mapa operacional".
- **Hierarquia primeiro, detalhes depois:** lista lateral mostra código, prioridade, endereço curto, viatura e ETA; clique abre detalhe com timeline, rotas, SLA e histórico. Tooltip no mapa é resumo, não modal enorme.
- Responsivo: mobile mapa ocupa maior parte da viewport, bottom sheet de ocorrências e ações persistentes; contraste e tipografia iguais.
- Ajuste ao usuário: não auto-centrar a câmera a cada telemetria; oferecer controle "Seguir viatura" ativado manualmente.

### Informações essenciais sempre à vista

**Card da ocorrência em andamento**: identificador, prioridade/tipo, endereço, viatura, \`ETA restante\` (ou "Calculando / indisponível"), status e tempo desde a criação.

**Detalhe da ocorrência**: ETA inicial, ETA atualizado, chegada real \`chegadaEm\`, tempo em fila, tempo em rota, duração total e timeline com segundos.

**Detalhe da viatura**: placa, status + "Em patrulha" quando livre, último sinal absoluto e relativo, último movimento, turno iniciado às HH:mm:ss, ocorrências iniciadas/concluídas no dia, turno decorrido, posição atual e destino ativo.

### Evitar dados demais

Ocultar por padrão coordenadas, versões, clientRequestId, UUID completo e metadados JSON; manter aba "Dados técnicos" ou "Auditoria" para investigação. Usar skeleton com largura correta e mensagens de vazio **específicas** ("Sem dados de turno", "Aguardando primeira telemetria", "Rota indisponível"), nunca \`0\` ou \`—\` ambíguos para falta de informação.

## 20. Plano de execução incremental (atualiza a seção 10)

- **Fase 0 (P0):** versionar ZIP v2 em branch de código, testar build e reproduzir ausência de timestamps, contadores e movimento das viaturas livres.
- **Fase 1 (P0):** persistência de sessão (conforme seção 8) + migrations compatíveis de \`chegadaEm\`, \`EventoOcorrencia\`, \`ultimoSinalEm\`, \`TurnoViatura\`, \`Patrulha\`.
- **Fase 2 (P0):** novos eventos/outbox versionados, ETA preliminar + posterior à alocação, linha do tempo auditável e KPIs com fonte de dados real.
- **Fase 3 (P0):** novo motor de patrulhamento das viaturas disponíveis com CAS, interrupção para despacho e retomada após encerramento.
- **Fase 4 (P0):** MapLibre, tema de alto contraste, Inter, marcadores SVG de carro, animação fluida e UI map-first.
- **Fase 5 (P0):** criação por busca/CEP/pin arrastável, prévia com ETA e confirmação explícita.
- **Fase 6 (P1):** subscriptions incrementais, recálculo moderado de ETA, paginação, filtros e tela de detalhes do turno.
- **Fase 7 (P0):** Playwright e integração Postgres/Redis/OSRM, teste de concorrência, relatório de eventos/latência, deploy Terraform em AWS us-east-1 após autorização.

**Não** habilitar AWS paga nem declarar a aplicação pronta sem builds e testes executados.

## 21. Critérios adicionais de aceite (v3.1)

- **AC-ETA-01**: após confirmação de localização, aparece ETA preliminar via OSRM Table Service ou estado explícito "indisponível"; nenhuma reserva antecipada.
- **AC-ETA-02**: viatura real alocada substitui a candidata preliminar, com ETA e rota correspondentes ao commit.
- **AC-ETA-03**: ETA inicial permanece preservado para comparação, ETA restante muda com a posição, estado de sinal e fator de simulação.
- **AC-TIME-01**: atingir 100% da rota grava \`chegadaEm\` no mesmo commit de \`NO_LOCAL\`, uma única vez.
- **AC-TIME-02**: após falha/reentrega, todas as centrais mostram o **mesmo horário original de chegada**, não a hora de recebimento do evento.
- **AC-TIME-03**: timeline mostra data/hora com segundos, ordem estável, origem e duração entre eventos conhecidos; não atribui dados ausentes à última atualização.
- **AC-GPS-01**: last signal e last movement são campos distintos; viatura parada com heartbeat válido permanece sinal OK.
- **AC-GPS-02**: sem sinal durante timeout, última coordenada fica congelada e alerta aparece no mapa, lista e detalhe.
- **AC-FLEET-01**: estatísticas de hoje são calculadas por query em \`America/Bahia\`, distinguindo despacho confirmado, concluído e cancelado.
- **AC-FLEET-02**: \`operandoDesde\` vem do turno ativo e não é inferido de \`criadoEm\`.
- **AC-PATROL-01**: após inicialização, todas as viaturas disponíveis com turno ativo patrulham ruas reais (movimento discreto no backend, fluido no navegador).
- **AC-PATROL-02**: despachar durante patrulha suspende a ronda atomicamente e inicia rota a partir da última posição confirmada, sem teleportar.
- **AC-PATROL-03**: concluir atendimento libera a viatura e retoma ronda a partir do local.
- **AC-PATROL-04**: duas réplicas do simulador nunca movem/avançam a mesma viatura duplicadamente após disputa ou replay.
- **AC-PATROL-05**: patrulhamento não exibe todas as rotas de ronda ao mesmo tempo, e toda viatura livre é elegível ao algoritmo de proximidade enquanto o sinal está válido.
- **AC-UI-01**: em 1366×768 o mapa ocupa >= 65% da área operacional horizontal e o primeiro viewport não contém banner promocional.
- **AC-UI-02**: textos funcionais não possuem fonte < 13px; corpos 15–16px, títulos 18px+, e contrastes WCAG AA são testados automaticamente.
- **AC-UI-03**: painel inicial mostra no máximo cinco KPIs compactos; detalhe técnico só aparece quando solicitado.
- **AC-UI-04**: todos os indicadores ausentes exibem motivo específico, nunca zero/número fabricado.
- **AC-QA-01**: E2E valida ciclo prévia ETA → abrir → despachar → patrulha interrompida → chegadaEm → timeline → encerrar → retomar patrulha.
- **AC-QA-02**: testes com simulação acelerada, pausa, perda de sinal, reentrega da chegada e múltiplas centrais não criam horários contraditórios.

## 22. Fontes técnicas para implementação

- OSRM Table Service (matriz ETA): https://project-osrm.org/docs/
- MapLibre animation on route: https://maplibre.org/maplibre-gl-js/docs/examples/animate-a-point-along-a-route/
- WCAG 2.2 text contrast: https://www.w3.org/TR/WCAG22/#contrast-minimum
- Relatório SDV original (regras de exclusão mútua e Federation) e ZIP Entrega Integrada v2 (diagnóstico de código).



---

# Decisão de UI v3.2 — MapLibre GL JS + MapTiler, mapa minimalista e explicativo

**Decisão confirmada em 04/11/2026:** usar **MapLibre GL JS** como motor de renderização e **MapTiler** como provedor de tiles vetoriais e geocoding. Não usar Google Maps, Mapbox GL JS ou Leaflet como mapa principal. **Status: especificação confirmada, ainda não implementada no código da aplicação.**

## Filosofia visual

**Minimalista, mas não vazio.** Mostrar o mínimo necessário para responder, em até dois segundos: **onde está a ocorrência, qual viatura vai atender, como ela está se movendo, por onde vai e quanto falta**. O desenho não deve concorrer visualmente com esses dados.

### Basemap

1. Ponto de partida: **MapTiler Dataviz Light**, customizado no MapTiler para corrigir contraste baixo. Não utilizar cinza excessivamente claro como estilo final.
2. Ruas locais: traçado cinza médio legível; avenidas principais: um pouco mais destacadas (sem amarelo de navegação rodoviária chamativo).
3. Exibir nomes de ruas/avenidas e bairros quando zoom permitir. Evitar rótulos de estabelecimentos comerciais, pins de restaurantes, anúncios, monumentos irrelevantes e excesso de POIs.
4. Parques/áreas verdes e vias principais com cores discretas, que preservem orientação. Mapa de Feira de Santana centralizado no perímetro urbano; não inventar malha.
5. Não habilitar edifícios 3D ou relevo decorativo. Mapa base 2D com north-up por padrão; rotação controlada pelo usuário é opcional.
6. Estilo alternativo **Dataviz Dark** ajustado para contraste, acionável no próprio mapa; salvar preferência em estado local não sensível. **Não** alterar a fonte de dados ou a lógica da rota ao alternar tema.
7. Sempre manter atribuições obrigatórias do provedor/dados cartográficos.

### Hierarquia das camadas

**Fundo → ruas/nomes → rotas → veículos → ocorrências → seleção → controles/contexto**.

- **Viaturas disponíveis patrulhando:** ícone SVG de carro, vista superior, cor verde escuro \`#08735A\`, heading e animação contínua pelas ruas. Não desenhar suas rotas de patrulhamento por padrão.
- **Viaturas despachadas/em deslocamento:** carro azul escuro \`#235FA4\` ou cor semântica distinta; rota da ocorrência em azul intenso (espessura 4–5 px), trajeto percorrido em azul de baixa opacidade. Nunca depender só da cor: tooltip com estado.
- **Viaturas no local:** carro imóvel, indicação "No local", horário real de chegada; não animar.
- **Ocorrência ativa:** pin circular vermelho \`#C83335\` com centro branco/ícone de alerta; prioridade alta recebe anel discreto, não pulso interminável. Se clicada, mostrar rótulo curto e rota associada.
- **Sinal atrasado:** última posição congelada + anel/estado "Sem sinal"; não interpolar dados inexistentes.
- **Seleção:** rota escolhida em destaque; outras rotas suavizadas. Nenhum conjunto de trajetos formando emaranhado visual.
- **Aglomerados em zoom distante:** cluster com número de viaturas/ocorrências; no zoom próximo separar ícones e permitir clique.
- **Marcadores em movimento:** interpolação via requestAnimationFrame ao longo da geometria OSRM, respeitando timestamps e versões do backend, sem extrapolação após timeout.

### Informação no mapa, sem sobrecarregar

No zoom urbano, cada veículo mostra apenas **ícone**, e opcionalmente prefixo em seleção/hover. Não colocar placa completa, tempos e UUID sobre cada ícone o tempo todo.

Ao **clicar numa viatura**: cartão compacto com prefixo, status ("Patrulhando", "Em deslocamento", "No local", "Sem sinal"), última telemetria, ocorrência vinculada e ETA se aplicável. Link/ação de abrir detalhe no painel lateral integrado.

Ao **clicar numa ocorrência**: número, prioridade, endereço/bairro, viatura designada, status e ETA; timeline e metadados completos somente no painel lateral.

**Legenda fixa discreta:** Verde = patrulhando/disponível; Azul = a caminho; Pin vermelho = ocorrência; Cinza = sem sinal. Não representar estados apenas por cor.

**Controles reduzidos:** zoom (+/-), centralizar frota/Feira de Santana, camadas/tema, filtro de estados, "acompanhar viatura" (opt-in). Sem menu de debug nem simulador na home.

### Layout

- Mapa preenche **65–72% da largura útil** do workspace no desktop, com altura de viewport. Lista de ocorrências e viaturas em painel lateral (320–400 px), com scroll independente e sem overlay bloqueando o mapa.
- Topbar compacta (56–64 px), 4–5 KPIs operacionais em faixa estreita, botão "Nova ocorrência".
- Mobile: mapa dominante, bottom-sheet expansível para ocorrência/viatura e ações; pin/localização sempre visíveis ao criar.
- Tipografia **Inter**: corpo 16 px, labels 13–14 px; alto contraste nos cards. Sem microtexto 9–11 px, textos decorativos em caixa alta ou versal excessivo.
- Remover banner e CTA "Explorar mapa operacional" da home; a home **já é** o mapa.

### Seleção da ocorrência (mesmo MapShell)

- O mapa do formulário reutiliza o MapLibre, não um mapa alternativo. Busca MapTiler Geocoding, reconhecimento de CEP via ViaCEP (quando aplicável), com restrição/região de Feira de Santana.
- Clique coloca **pin grande e imediatamente visível**; arrastar atualiza posição; geocodificação reversa exibe endereço (ou indica ausência).
- Resumo de local selecionado e botão "Confirmar localização" antes de "Registrar ocorrência".
- O pin aparece enquanto o operador ajusta a localização; **nenhuma ocorrência salva coordenada de seed/default**.
- Após seleção, apresentar **ETA preliminar** por OSRM; ao despachar usar ETA da viatura efetivamente alocada.

### Responsabilidades bem separadas

- **MapLibre GL JS**: mapa vetorial, camadas, controles, ícones e animação.
- **MapTiler**: estilos/tiles, busca e geocoding reverso.
- **OSRM**: geometria, distância viária e duração/ETA. MapTiler não substitui a fonte canônica do roteamento.
- **Backend PostgreSQL + Redis + GraphQL**: posição canônica, despacho, eventos e atualização em tempo real; a animação do browser não grava posição.
- Credencial pública de tiles/geocoding é chave de API restrita por domínio e quota, via \`VITE_MAPTILER_API_KEY\`; não colocar segredos AWS ou tokens de backend no frontend. MapTiler exige contratação/conta própria, separada dos créditos AWS.

### Critérios adicionais

- AC-MAP-V3-01: todo mapa da central usa MapLibre GL JS + MapTiler Dataviz Light customizado, legível em Feira de Santana.
- AC-MAP-V3-02: ruas principais, bairros e rótulos essenciais são legíveis sem excesso de POIs; estilo Dark é acessível e mantém símbolos/contrastes.
- AC-MAP-V3-03: sem abrir cartões, é possível distinguir viatura livre, em deslocamento, no local e ocorrência ativa por símbolo e cor.
- AC-MAP-V3-04: a 1366×768, mapa é o componente principal, sem banner e com painel integrado; a 390×844, pin e controles continuam visíveis.
- AC-MAP-V3-05: viaturas patrulhando deslocam-se fluidamente e não mostram rotas de ronda em massa; a rota de um despacho selecionado é destacada.
- AC-MAP-V3-06: seleção de ocorrência mostra marcador confirmado, endereço e ETA preliminar; não cria sem confirmação explícita.
- AC-MAP-V3-07: seleção de veículo/ocorrência exibe cartão curto explicativo, sem sobrecarga de texto; detalhes profundos vão ao painel.
- AC-MAP-V3-08: sem telemetria, carro não continua andando artificialmente; hora do último sinal fica explícita.
- AC-MAP-V3-09: UI cumpre contraste WCAG AA para texto e distingue estados sem depender só de cor.
- AC-MAP-V3-10: teste visual valida a hierarquia em zoom cidade, bairro e rua, com três despachos ativos, viaturas patrulhando e pin selecionado.

**Referências:** https://www.maptiler.com/maps/dataviz/ ; https://docs.maptiler.com/sdk-js/api/map-styles/ ; https://maplibre.org/maplibre-gl-js/docs/ ; https://docs.maptiler.com/cloud/api/geocoding/
