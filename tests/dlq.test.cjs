'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CircuitBreaker, CircuitBreakerOpenError } = require('../packages/shared/circuit-breaker.cjs');

test('dlq: identifica mensagem com payload corrompido e desvia para DLQ', async () => {
  const dlqEntries = [];
  const ackedMessages = [];

  // Simula o mecanismo de desvio implementado no worker
  const processStreamMessage = async (messageId, rawPayload) => {
    let p;
    try {
      p = JSON.parse(rawPayload);
    } catch (err) {
      // Simula escrita em sdv:dlq
      dlqEntries.push({
        messageId,
        erro: 'JSON inválido',
        payload: rawPayload,
      });
      ackedMessages.push(messageId);
      return { status: 'DLQ_POISON_PILL' };
    }
    return { status: 'OK', data: p };
  };

  // 1. Mensagem válida
  const resOk = await processStreamMessage('msg-001', JSON.stringify({ ocorrenciaId: 'oc-1' }));
  assert.equal(resOk.status, 'OK');
  assert.equal(dlqEntries.length, 0);

  // 2. Mensagem inválida / corrompida (poison pill)
  const resFail = await processStreamMessage('msg-002', '{corrupted_json_sem_fechar');
  assert.equal(resFail.status, 'DLQ_POISON_PILL');
  assert.equal(dlqEntries.length, 1);
  assert.equal(dlqEntries[0].messageId, 'msg-002');
  assert.equal(dlqEntries[0].erro, 'JSON inválido');

  // A mensagem corrompida foi confirmada (ACK) para não travar o stream
  assert.ok(ackedMessages.includes('msg-002'));
});

test('dlq: move para DLQ após atingir o limite de 3 tentativas em falhas repetidas', async () => {
  const dlqEntries = [];
  const ackedMessages = [];
  const attemptsTracker = new Map();

  const handleMessageWithRetry = async (messageId, payload, simulateFailure) => {
    try {
      if (simulateFailure) {
        throw new Error('Falha de consistência interna na ocorrência');
      }
      ackedMessages.push(messageId);
      attemptsTracker.delete(messageId);
      return 'PROCESSED';
    } catch (err) {
      const attempts = (attemptsTracker.get(messageId) || 0) + 1;
      attemptsTracker.set(messageId, attempts);

      if (attempts >= 3) {
        dlqEntries.push({
          messageId,
          payload,
          tentativas: attempts,
          erro: err.message,
        });
        ackedMessages.push(messageId);
        attemptsTracker.delete(messageId);
        return 'MOVED_TO_DLQ';
      }
      throw err;
    }
  };

  const payload = { ocorrenciaId: 'oc-falha-grave' };

  // Tentativa 1 -> Falha transitória
  await assert.rejects(() => handleMessageWithRetry('msg-100', payload, true));
  assert.equal(attemptsTracker.get('msg-100'), 1);
  assert.equal(dlqEntries.length, 0);

  // Tentativa 2 -> Falha transitória
  await assert.rejects(() => handleMessageWithRetry('msg-100', payload, true));
  assert.equal(attemptsTracker.get('msg-100'), 2);
  assert.equal(dlqEntries.length, 0);

  // Tentativa 3 -> Limite atingido, desvia para DLQ e faz ACK
  const result = await handleMessageWithRetry('msg-100', payload, true);
  assert.equal(result, 'MOVED_TO_DLQ');
  assert.equal(dlqEntries.length, 1);
  assert.equal(dlqEntries[0].messageId, 'msg-100');
  assert.equal(dlqEntries[0].tentativas, 3);
  assert.ok(ackedMessages.includes('msg-100'));
});

test('dlq e circuit breaker: falha por CircuitBreakerOpen não queima tentativas da mensagem como poison pill', async () => {
  const cb = new CircuitBreaker({ name: 'viaturas', failureThreshold: 1 });
  cb.trip(); // Força abertura do circuito

  let tentativasDLQ = 0;
  const processWithBreaker = async () => {
    try {
      await cb.execute(async () => {
        return 'chamada-viaturas';
      });
    } catch (err) {
      if (err instanceof CircuitBreakerOpenError) {
        // Não queima tentativa da mensagem
        return 'RETRY_LATER_CIRCUIT_OPEN';
      }
      tentativasDLQ++;
      throw err;
    }
  };

  const outcome = await processWithBreaker();
  assert.equal(outcome, 'RETRY_LATER_CIRCUIT_OPEN');
  assert.equal(tentativasDLQ, 0, 'Não deve queimar tentativas de DLQ enquanto o circuito estiver aberto');
});
