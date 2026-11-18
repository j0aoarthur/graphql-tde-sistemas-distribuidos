# Plano de melhorias pós-v3.2

Origem: revisão manual do painel após o PR #6 (UX dos drawers, fila, histórico, temas, placa/referência).
Regras do projeto (AGENTS.md) valem aqui: PRs pequenos e testados; nenhum critério é dado como passou sem teste executável e evidência; sem segredos em código/log/localStorage; simulação, nunca despacho real.

## Estado de partida
- CI do PR #6 verde: 32 testes E2E (Playwright), contrato GraphQL + concorrência com Redis/PostgreSQL reais, build/contratos, Terraform.
- O E2E não cobre aparência (sobreposição, tema escuro, ordem de camadas no mapa). Os itens 3, 5 e 7 abaixo vieram dessa lacuna: **funcional ≠ visualmente correto**.

## Resumo e ordem sugerida

| # | Item | Tipo | Esforço | Estado |
|---|------|------|---------|--------|
| 4 | Ações do drawer devem sobrepor o drawer | Bug de UI | P | **Feito** (correção + teste `camadas-tema.spec.ts`) |
| 5 | Tema escuro: fundo e fonte no drawer | Bug de UI | P | **Feito** |
| 7 | "CONTROLE DE RECURSOS" não muda com o tema | Bug de UI | P | **Feito** |
| 3 | Viatura abaixo do indicador da ocorrência | Bug de UI (mapa) | P | **Feito** |
| 6 | Novos ícones de viatura | Design | M | **Feito** — opção **A** (sedã refinado) escolhida |
| 1 | Swagger | Documentação/API | M | **Feito** |

Entrega: **um único PR** com todos os itens (decisão do responsável).

---

## 1. Swagger
**Contexto.** Os serviços são GraphQL (Apollo Federation); a parte REST é pequena: no gateway `/auth/login|refresh|logout` (proxy de sessão) e `/health`; internamente `/internal/dispatch` e `/internal/finish` (protegidos por `x-internal-token`).
**Proposta.**
- `@nestjs/swagger` no **gateway**, em `/docs`, documentando auth (corpo, cookie de refresh, códigos 401/403/429) e health. Ligado só com `SWAGGER_ENABLED=1` e nunca em produção por padrão.
- **Não** documentar `/internal/*` (superfície interna, token compartilhado).
- Para GraphQL, o equivalente é o schema: `npm run schema:export` gera o SDL federado em `docs/schema.graphql`, e o Apollo Sandbox já existe fora de produção.
**Aceite.** `/docs` lista os 4 endpoints com exemplos sem segredos; teste de contrato garante que as rotas documentadas existem e que `/internal/*` não aparece; build e lint verdes.

## 3. Viatura fica abaixo do indicador da ocorrência
**Hipótese.** Marcadores do MapLibre são elementos DOM; a ordem de empilhamento sai da ordem de criação/latitude. O pin da ocorrência cobre a viatura quando chega ao local.
**Proposta.** `z-index` explícito por tipo (viatura acima do pin quando coincidem; selecionado acima de tudo); ancorar o pin pela ponta inferior (`anchor:'bottom'`) para não ficar sobre o carro; opcional: leve deslocamento do pin quando há viatura em até ~15 m.
**Aceite.** Teste Playwright: com viatura `NO_LOCAL` no ponto da ocorrência, `elementFromPoint` no centro do carro devolve o marcador da viatura; captura nos dois temas.

## 4. Ações do drawer devem sobrepor o drawer
**Causa encontrada.** `.modal-backdrop` e `.detail-overlay` tinham o mesmo `z-index` (1000); o diálogo de confirmação ficava atrás do drawer e o botão de confirmar não recebia clique.
**Feito.** `.modal-backdrop{z-index:1100}` (commit `3bc9e18`).
**Falta.** Cobrir todas as ações do drawer (cancelar, encerrar, pausar/retomar, ver no mapa) nos três contextos (central, mapa, global); teste que confirme que o botão do diálogo é o elemento do topo (`elementFromPoint`); revisar foco e Esc com drawer + modal empilhados.

## 5. Tema escuro: fundo e fonte do drawer
**Sintoma.** O texto encosta na borda do fundo do drawer no tema escuro.
**Hipótese.** Regras herdadas de `theme-dark.css` pintam blocos internos (`.dw-*`) com fundo próprio sem o respiro do tema claro (padding/borda vêm do CSS legado).
**Proposta.** Auditar `.dw*` e blocos do detalhe com tokens `--ux-*` (superfície, borda, texto) e padding explícito; remover sobras de cores fixas.
**Aceite.** Capturas do drawer (ocorrência e viatura) nos dois temas; axe AA nos dois temas para as 3 telas com drawer.

## 6. Novos ícones de viatura
Restrições do projeto: ativos originais (não copiar Uber/99), cor por status, giram pelo heading, animação suave sobre a geometria da rua, e o status não pode depender só de cor.
**Opções para escolher** (cada uma será entregue em SVG, nos 3 estados — patrulha, deslocamento, no local — sobre mapa claro e escuro):
- **A. Viatura sedã vista de cima, refinada:** barra de luz e capô marcados, menos "carro de brinquedo", sombra suave. É o estilo atual, melhorado.
- **B. SUV/picape de patrulha:** silhueta mais larga, leitura melhor em zoom baixo.
- **C. Moto de patrulha:** silhueta fina com farol; boa para variar a frota (tipos de viatura).
- **D. Camburão/van:** retangular, barra de luz frontal; reconhecível de longe.
- **E. Seta de navegação em círculo com escudo:** minimalista, escala bem em qualquer zoom, anel de cor por status (opção mais "limpa", menos realista).
- **F. Selo (badge) + seta de direção:** o número `VTR-0xx` dentro do selo, seta indica o heading; ótimo para apresentação, pois identifica a viatura sem abrir o detalhe.
**Entrega.** Página de pré-visualização lado a lado para você escolher; depois aplicar no mapa mantendo o pipeline de rotação/animação atual.

## 7. "CONTROLE DE RECURSOS" não muda com o tema
**Causa provável.** O bloco `.fleet-hero` (Viaturas) usa cores fixas em `style.css` e só um pedaço (`.fleet-hero-numbers`) foi coberto em `theme-dark.css`.
**Proposta.** Migrar `.fleet-hero*` para tokens `--ux-*`. Varredura de `style.css` por cores fixas em blocos de página (`grep` de `#fff`, `#f…`, `background:#…`) e migração dos que fogem do tema.
**Aceite.** Teste que percorre as 6 telas nos dois temas e falha se algum bloco de página mantiver fundo claro no tema escuro (checagem de luminância do fundo dos cartões principais) + axe AA nas duas variantes.
