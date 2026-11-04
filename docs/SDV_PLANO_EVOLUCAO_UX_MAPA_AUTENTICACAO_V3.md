# SDV — Plano de evolução operacional de UX, mapa, ocorrências e autenticação (v3.0)

**Status:** planejamento revisado a partir do código da Entrega Integrada v2 (ZIP anexado à conversa), não implementado neste PR.
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
