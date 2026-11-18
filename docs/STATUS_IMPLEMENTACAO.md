# SDV — Estado de implementação (entrega integrada)

| Item | Código | Validado neste ambiente |
|---|---|---|
| Login ADMIN e centrais por seed | Sim | Não (sem serviços ativos) |
| Ocorrências com Outbox e idempotência | Sim | Sintaxe TS |
| Lock Redis + UPDATE condicional + unique index | Sim | Esquema SQL presente; E2E pendente |
| Worker Streams + pending + reconciliação | Sim | Sintaxe TS |
| Encerramento, cancelamento e liberação | Sim | E2E pendente |
| Roteamento por ruas OSRM | Sim | OSRM e dados pendentes |
| GPS fictício e atualizações Redis Pub/Sub | Sim | Testes unitários de geometria |
| GraphQL Subscriptions (`/subscriptions`) | Sim | Teste WebSocket pendente |
| React frontend desktop e mobile | Sim | Build e teste visual pendentes |
| Terraform Single-AZ com serviços gerenciados | Sim | `terraform validate` pendente |
| GitHub Actions CI e ECS deploy | Sim | Execução na conta pendente |
| Provisionamento AWS | Não | Não autorizado nem realizado |
| Alteração no repositório remoto | **Sim — baseline v2 em `feat/sdv-v2-executable-baseline`** | PR #2 aberto como draft; ainda não mergeado na main nem homologado |

Consulte README.md para reproduzir e requisitos de segurança.

**Atualização de 05/11/2026:** o bloqueio 403 de escrita do GitHub foi resolvido. Os 75 arquivos do baseline v2 estão na branch `feat/sdv-v2-executable-baseline` e no PR #2; esta observação substitui o status histórico acima. Testes unitários offline reexecutados: 5/5 aprovados. Build integrado, Docker, GraphQL E2E, MapTiler e AWS permanecem não validados.
