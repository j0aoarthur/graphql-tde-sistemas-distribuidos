'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogger, runWithContext, getCorrelationId, randomUUID } = require('../packages/shared/logger.cjs');

test('tracing: propaga o mesmo correlationId de ponta a ponta na cadeia de nós', async () => {
  const logsCaptured = [];

  // Cria loggers para cada nó da arquitetura distribuída
  const gatewayLogger = createLogger('gateway');
  const ocorrenciasLogger = createLogger('ocorrencias-service');
  const workerLogger = createLogger('dispatch-worker');
  const viaturasLogger = createLogger('viaturas-service');

  // Intercepta saídas para validar a auditoria de rastreamento
  const intercept = (loggerInstance) => {
    const origInfo = loggerInstance.info;
    return (msg, meta) => {
      const entry = origInfo(msg, meta);
      logsCaptured.push(entry);
      return entry;
    };
  };

  const logGw = intercept(gatewayLogger);
  const logOc = intercept(ocorrenciasLogger);
  const logWk = intercept(workerLogger);
  const logVt = intercept(viaturasLogger);

  // 1. Gateway recebe requisição do cliente (ou gera se ausente)
  const clientProvidedId = randomUUID();
  let outboxPayload = null;
  let fleetHeadersSent = null;

  await runWithContext({ correlationId: clientProvidedId, service: 'gateway' }, async () => {
    logGw('Requisição GraphQL recebida no Gateway', { path: '/graphql', operation: 'abrirOcorrencia' });

    // 2. Gateway propaga via header para o subgrafo Ocorrências
    const forwardedHeader = getCorrelationId();
    assert.equal(forwardedHeader, clientProvidedId);

    // 3. Subgrafo Ocorrências processa com o header recebido
    await runWithContext({ correlationId: forwardedHeader, service: 'ocorrencias-service' }, async () => {
      logOc('Criando ocorrência e persistindo no outbox', { ocorrenciaId: 'oc-001' });

      // Ocorrências grava o correlationId dentro do payload do outbox
      outboxPayload = {
        ocorrenciaId: 'oc-001',
        latitude: -12.26,
        longitude: -38.96,
        correlationId: getCorrelationId(),
      };
    });
  });

  assert.equal(outboxPayload.correlationId, clientProvidedId);

  // 4. Dispatch Worker consome evento do Redis Stream / Outbox
  await runWithContext({ correlationId: outboxPayload.correlationId, service: 'dispatch-worker' }, async () => {
    logWk('Worker processando mensagem do stream', { ocorrenciaId: outboxPayload.ocorrenciaId });

    // 5. Worker chama viaturas via HTTP interno (/internal/dispatch) propagando header
    fleetHeadersSent = {
      'content-type': 'application/json',
      'x-internal-token': 'token-secreto',
      'x-correlation-id': getCorrelationId(),
    };

    // 6. Subgrafo Viaturas processa a alocação recebendo o header
    await runWithContext({ correlationId: fleetHeadersSent['x-correlation-id'], service: 'viaturas-service' }, async () => {
      logVt('Viatura alocada para ocorrência', { ocorrenciaId: outboxPayload.ocorrenciaId, viaturaId: 'vt-42' });
    });
  });

  // Auditoria de Tracing (Critério C6 e Teste de Caos do Barema)
  assert.equal(logsCaptured.length, 4);

  // Todos os 4 nós registraram logs com o mesmo correlationId
  const correlationIds = logsCaptured.map(l => l.correlationId);
  assert.deepEqual(correlationIds, [clientProvidedId, clientProvidedId, clientProvidedId, clientProvidedId]);

  // Cada nó foi identificado corretamente
  const services = logsCaptured.map(l => l.service);
  assert.deepEqual(services, ['gateway', 'ocorrencias-service', 'dispatch-worker', 'viaturas-service']);

  // Cada log é JSON estruturado com timestamp válido
  for (const entry of logsCaptured) {
    assert.ok(entry.timestamp);
    assert.equal(entry.level, 'INFO');
    assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  }
});
