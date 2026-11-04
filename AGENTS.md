# AGENTS.md — SDV

## Purpose

This repository is for a distributed GraphQL Federation police/incident dispatch *simulation*. The map uses real streets in Feira de Santana, BA, but vehicle telemetry and incidents are fictional. Do **not** imply suitability for real emergency dispatch.

## Project-specific expectations

- Preserve the requirements in \`relatorio-planejamento-tecnico-sdv.md\` and \`docs/SDV_PLANO_EVOLUCAO_UX_MAPA_AUTENTICACAO_V3.md\`.
- The execution/acceptance protocol is \`docs/CODEX_CLOUD_TEST_PROTOCOL.md\`.
- Prefer tested, small pull requests. Never say an acceptance criterion passed without an executable test and evidence.
- The code baseline is \`SDV_Entrega_Integrada_v2.zip\`, previously generated in a ChatGPT conversation. It must be **committed to a code branch** before Codex Cloud can test it. The default branch currently has documentation and a static site only.
- Target Node.js 22+, NestJS, Apollo Federation, Prisma/PostgreSQL, Redis Streams, React/Vite, MapLibre GL JS + MapTiler, and OSRM.
- Do not replace consistency with a Redis lock alone: conditional PostgreSQL update + uniqueness are canonical.
- Preserve Outbox, at-least-once consumption, idempotency, event reconciliation, and the two-service database boundary.
- No native app for drivers. Admin accounts and dispatch centers are seeded by scripts. Available vehicles patrol automatically while on duty.
- Test JWT refresh on page reload; persist real \`chegadaEm\`, \`ultimoSinalEm\` and operational events; preserve time zone America/Bahia for daily metrics.
- Vehicle markers should be original 3D-styled car assets, not copied from Uber/99. Color by status, rotate on heading, animate smoothly on street geometry.
- Backend position remains canonical; no invented position when telemetry is stale.
- No paid AWS Terraform apply/deploy without explicit user authorization; stay Single-AZ in us-east-1 as requested.
- No secrets in source, browser localStorage or logs.

## Validation

1. \`npm install --no-audit --no-fund\`
2. \`npm run db:generate\`
3. \`npm test\`
4. \`npm run build\`
5. Integration with PostgreSQL + Redis; \`npm run test:concurrency\`.
6. GraphQL WebSocket reconnect, application E2E with Playwright desktop/mobile, MapLibre visual snapshots and geocoding mocks.
7. Terraform \`fmt -check\` and \`validate\` without apply.
8. Report each acceptance criterion as **PASSOU**, **FALHOU**, or **BLOQUEADO**, with logs and SHA.

If code, Docker, MapTiler test access or environment capabilities are absent, report BLOCKED; do not silently skip or fabricate success.
