# Validação Playwright: design e ações

Rodada de 05–06/11/2026 UTC. Código de UI validado: `701c92ec72344047de2e23541b39ecabe83ebe67`, continuação do PR #6, branch `fix/sdv-realistic-motion-form`.

Foram exercitadas as seis telas operacionais em **1440×900, 1024×900, 820×900, 768×844, 390×844 e 360×844**, com cliques reais do navegador, teclado, screenshots e axe. O backend, PostgreSQL e Redis são reais e isolados; MapTiler/ViaCEP e OSRM usam fixtures explícitas. O fundo neutro das capturas é uma base cartográfica de teste, sem comprovação da cobertura real do provedor.

Resultado local: **28 cenários Playwright únicos aprovados**, compostos pela rodada completa de 27 cenários e pelo cenário adicional do laboratório. Também passaram revalidações direcionadas do modal e da tela de 360 px. Os registros mantêm a contagem de cada comando: [suíte completa](evidence/playwright-design/playwright.log), [laboratório + 360 px](evidence/playwright-design/laboratorio.log), [modal](evidence/playwright-design/modal.log). O CI do PR executa a suíte atual com os 28 cenários em uma rodada.

A rotina de limpeza dos testes foi extraída para helper no commit `6a5d7d85147d3033576e93d6addc16ee4a7e75c8`, preservando os fontes de aplicação de `701c92e`. O cadastro foi [revalidado com esse helper](evidence/playwright-design/cleanup.log) e o lint passou; a verificação não desabilita nenhuma regra.

As **36 combinações de tela/largura** terminaram sem overflow horizontal da página e sem violações axe nos conjuntos `wcag2a` e `wcag2aa`. As tabelas largas continuam com scroll interno, acessível pelo teclado. O [resumo JSON](evidence/playwright-design/summary.json) registra as dimensões medidas, o SHA e os resultados. Foram produzidas 42 capturas de navegador; uma amostra permanente está abaixo e o conjunto completo integra os artefatos do CI.

## Falhas encontradas e corrigidas

- Texto com contraste baixo em filtros, tabelas, identificadores, estados neutros, laboratório e campos auxiliares. As cores secundárias foram corrigidas e verificadas em todas as telas e larguras.
- Em 360 px, cabeçalho e KPIs ampliavam a largura da página para até 380 px. O cabeçalho agora ajusta o texto e os indicadores usam uma grade responsiva.
- Tabelas com scroll não recebiam foco; a abertura dos detalhes dependia do clique na linha. Foram adicionadas regiões de tabela com foco e botões SVG nomeados para cada registro.
- O menu fechado no celular ainda podia receber foco fora da tela. A visibilidade agora acompanha o estado do menu.
- Os nomes dos campos de texto e capacidade precisavam permanecer estáveis depois da edição. Foram definidos rótulos acessíveis explícitos.
- A regra de placa usava um hífen sem escape, inválido no modo `v` dos padrões HTML atuais. O navegador ignorava o pattern; a regra foi corrigida e a validação inválida/válida foi executada antes da persistência.
- O modal de viatura recebeu foco inicial, contenção de Tab/Shift+Tab e restauração do foco após Escape.
- A legenda ocupava boa parte do mapa pequeno da frota. Ela agora inicia recolhida e pode ser expandida por clique ou teclado.

## Critérios executados

| ID | Status | Ação / validação | Evidência |
| --- | --- | --- | --- |
| QA-DESIGN-01 | **PASSOU** | Central, mapa, ocorrências, frota, histórico e laboratório: títulos, navegação, ações principais alcançáveis e largura da página nas seis resoluções. | [Resumo de 36 combinações](evidence/playwright-design/summary.json) |
| QA-DESIGN-02 | **PASSOU** | axe em todas as combinações de tela/largura e nos modais; contraste e nomes acessíveis revisados. Sem alegação de certificação manual de toda a WCAG. | [Logs](evidence/playwright-design/playwright.log), [modal](evidence/playwright-design/modal.log) |
| QA-DESIGN-03 | **PASSOU** | Filtros de mapa, seleção de veículo visível, acompanhar/parar ao fazer pan, zoom, tema, centralização e exibição de rotas. | [Mapa em tema escuro](evidence/playwright-design/mapa-acoes-tema.png) |
| QA-DESIGN-04 | **PASSOU** | Autocomplete pelo teclado, selects, foco preservado durante atualização do relógio, confirmação, Tab/Shift+Tab e Escape. | [Formulário](evidence/playwright-design/formulario-teclado.png) |
| QA-DESIGN-05 | **PASSOU** | Registrar ocorrência, localizar despacho no histórico, pausar, verificar ETA suspenso, retomar e cancelar com justificativa na timeline. | [Despacho](evidence/playwright-design/despacho-retomado.png) |
| QA-DESIGN-06 | **PASSOU** | Busca de viatura, estados vazios e filtros; abrir detalhes por Enter e scroll de tabela com setas; legenda compacta por teclado. | [Tabela mobile](evidence/playwright-design/tabela-teclado-mobile.png) |
| QA-DESIGN-07 | **PASSOU** | Cadastro: placa inválida bloqueada no cliente, placa válida, capacidade, pin, gravação via API e linha persistida na tabela. Modal abre com foco e Escape devolve foco ao botão de origem. | [Cadastro mobile](evidence/playwright-design/cadastro-viatura-mobile.png), [log](evidence/playwright-design/modal.log) |
| QA-DESIGN-08 | **PASSOU** | Laboratório: pausa/retomada, slider pelo teclado, fator persistido em Redis/API, restauração de 1× e Sincronizar por clique. | [Log](evidence/playwright-design/laboratorio.log) |
| QA-DESIGN-09 | **PASSOU** | Regressão de sessão, TLS local, WebSocket, pin/CEP, consultas obsoletas, três despachos, chegada e retomada da patrulha. | [Suíte completa](evidence/playwright-design/playwright.log) |
| QA-DESIGN-10 | **PASSOU** | Build dos seis apps, lint e dez testes unitários. | [Qualidade](evidence/playwright-design/quality.log) |
| QA-MAPTILER-REAL | **BLOQUEADO** | Cartografia, rótulos e cobertura real de endereços exigem chave MapTiler válida e restrita. Não foram homologados com as fixtures. | Limite explícito do ambiente |

## Capturas revisadas

[Central em 360 px](evidence/playwright-design/360-central.png) · [Frota em 390 px](evidence/playwright-design/390-frota.png) · [Laboratório desktop](evidence/playwright-design/1440-laboratorio.png) · [Formulário](evidence/playwright-design/formulario-teclado.png) · [Cadastro mobile](evidence/playwright-design/cadastro-viatura-mobile.png).

## Reprodução

Com o ambiente local isolado do [guia de execução](SDV_REFINAMENTOS_V3_2.md) já iniciado e as variáveis de teste carregadas:

```sh
npx playwright test tests/design-actions.spec.ts --workers=1 --reporter=line
npx playwright test --workers=1 --reporter=line
```

Os testes cancelam somente ocorrências que criam, por API autorizada, e restauram o laboratório em 1×, sem pausa. O cadastro remove somente sua própria viatura fictícia do banco local de teste, com ID/placa e status conferidos em transação. Não publique traces contendo headers de sessão ou valores de credenciais; as evidências permanentes contêm apenas capturas, métricas e logs de sucesso. Nenhum deploy AWS foi realizado.
