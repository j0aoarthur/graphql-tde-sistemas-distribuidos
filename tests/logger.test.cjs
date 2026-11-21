'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogger, runWithContext, getCorrelationId, getContext, randomUUID } = require('../packages/shared/logger.cjs');

test('logger: emite log estruturado com campos obrigatórios', () => {
  const logger = createLogger('teste-service');
  const entry = logger.info('Operação concluída com sucesso', { ocorrenciaId: '123' });
  
  assert.equal(entry.level, 'INFO');
  assert.equal(entry.service, 'teste-service');
  assert.equal(entry.message, 'Operação concluída com sucesso');
  assert.equal(entry.ocorrenciaId, '123');
  assert.ok(entry.timestamp);
  assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('logger: propaga correlationId através do AsyncLocalStorage em chamadas assíncronas', async () => {
  const logger = createLogger('gateway');
  const testId = randomUUID();

  await runWithContext({ correlationId: testId }, async () => {
    assert.equal(getCorrelationId(), testId);
    
    const log1 = logger.info('Iniciando requisição');
    assert.equal(log1.correlationId, testId);

    // Simula atraso assíncrono (I/O)
    await new Promise(r => setTimeout(r, 10));

    assert.equal(getCorrelationId(), testId);
    const log2 = logger.info('Requisição finalizada');
    assert.equal(log2.correlationId, testId);
  });

  // Fora do contexto assíncrono, correlationId volta a ser nulo/indefinido
  assert.equal(getCorrelationId(), null);
});

test('logger: serializa instâncias de Error sem perder stack e message', () => {
  const logger = createLogger('viaturas-service');
  const err = new Error('Falha de conexão com banco');
  const entry = logger.error('Erro ao conectar', err);

  assert.equal(entry.level, 'ERROR');
  assert.equal(entry.message, 'Erro ao conectar');
  assert.ok(entry.error);
  assert.equal(entry.error.message, 'Falha de conexão com banco');
  assert.ok(entry.error.stack);
});

test('logger: withContext encadeado herda e permite sobrescrita de propriedades', async () => {
  const logger = createLogger('worker');
  const cId1 = randomUUID();
  const cId2 = randomUUID();

  await logger.withContext({ correlationId: cId1, fila: 'alta' }, async () => {
    const l1 = logger.info('Msg 1');
    assert.equal(l1.correlationId, cId1);
    assert.equal(getContext().fila, 'alta');

    await logger.withContext({ correlationId: cId2 }, async () => {
      const l2 = logger.info('Msg 2');
      assert.equal(l2.correlationId, cId2);
      // Fila herdada do pai
      assert.equal(getContext().fila, 'alta');
    });

    const l3 = logger.info('Msg 3');
    assert.equal(l3.correlationId, cId1);
  });
});
