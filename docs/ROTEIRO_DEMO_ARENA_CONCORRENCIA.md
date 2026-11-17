# Roteiro de demonstração — Arena de concorrência (≈ 2 min)

> Simulação acadêmica: viaturas, chamados e telemetria são fictícios; o mapa usa ruas reais de Feira de Santana.

## Preparação (antes da apresentação)
```bash
npm run build
GATEWAY_PORT=4010 npm run demo:arena            # 3 workers, SDV_DEMO_TRACE=1, SDV_DEMO_MODE=1
GATEWAY_URL=http://localhost:4010 VITE_DEMO_ARENA=1 npm run dev:frontend
```
Postgres, Redis, OSRM, ocorrencias-service e gps-simulator devem estar no ar. Para o mapa com base, configure a chave MapTiler.
Entre em http://localhost:5173 (`central-a@sdv.local`), abra **Arena de concorrência** e ative **Modo apresentação**.
Atalhos: `P` preparar · `D` disparar · `L` liberar · `R` reiniciar · `Esc` sair.

## Falas e ações
1. **Contexto (15 s).** "Duas ou mais centrais podem abrir chamados ao mesmo tempo, e a frota é compartilhada. O risco é a mesma viatura ser alocada para dois chamados."
2. **`P` — Preparar (10 s).** "Deixo só 3 viaturas livres; as outras ficam reservadas. Há 3 workers (W1, W2, W3) consumindo o mesmo stream do Redis."
3. **`D` — Disparar 8 (30 s).** "8 chamados no mesmo instante, no mesmo ponto." Aponte: **3 despachados, 5 em espera, 0 viaturas duplicadas**. Na linha do tempo: "W2 perdeu o lock da VTR-003 e foi para a próxima."
4. **Camadas (25 s).** "O lock do Redis é só otimização. Quem decide é o UPDATE condicional no PostgreSQL; o índice único parcial é a rede final." Mostre os contadores e o quadro **Prova no banco** (0 linhas).
5. **Lock desligado (25 s).** Clique em **Lock do Redis**, `R`, `P`, `D`. "Sem o Redis, o CAS barra as tentativas e continua 0 duplicadas: a consistência não depende do lock."
6. **`L` — Liberar (15 s).** "A viatura volta e o primeiro da fila (maior prioridade, depois o mais antigo) entra em ~1 s, sem esperar o ciclo de 15 s."
7. **`R` — Reiniciar.** Restaura viaturas e cancela os chamados `[ARENA]`.

## Verificação por linha de comando
`npm run test:trace` · `npm run test:arena` · `npm run test:arena:sem-lock` · `npx playwright test tests/arena.spec.ts`

## Encerrar
`npm run demo:arena:stop` (restaura viaturas reservadas e derruba os processos da arena). Depois suba os serviços sem `SDV_DEMO_*`.

## Limites honestos
- O navegador abre ~6 conexões por origem; com muitos chamados o disparo escalona por milissegundos. A corrida real vem das réplicas de worker.
- Os contadores de CAS e índice podem ser 0 com o lock ligado (o Redis barra antes). Por isso o passo 5.
- O rastro é Pub/Sub transitório e só existe com `SDV_DEMO_TRACE=1`; a verdade continua no PostgreSQL.
