'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CircuitBreaker, CircuitBreakerOpenError, CircuitState } = require('../packages/shared/circuit-breaker.cjs');

test('circuit-breaker: inicia no estado CLOSED e executa funções normalmente', async () => {
  const cb = new CircuitBreaker({ name: 'servico-teste', failureThreshold: 3 });
  assert.equal(cb.getState(), CircuitState.CLOSED);

  const res = await cb.execute(async () => 'resultado-ok');
  assert.equal(res, 'resultado-ok');
  assert.equal(cb.getState(), CircuitState.CLOSED);
  assert.equal(cb.getStats().consecutiveFailures, 0);
  assert.equal(cb.getStats().consecutiveSuccesses, 1);
});

test('circuit-breaker: abre o circuito (OPEN) após atingir o limiar de falhas consecutivas', async () => {
  const stateChanges = [];
  const cb = new CircuitBreaker({
    name: 'servico-viaturas',
    failureThreshold: 3,
    cooldownMs: 200,
    onStateChange: (novo, anterior) => stateChanges.push({ novo, anterior }),
  });

  const falhar = async () => {
    throw new Error('Timeout 504 no servico downstream');
  };

  // Falha 1
  await assert.rejects(() => cb.execute(falhar), /Timeout 504/);
  assert.equal(cb.getState(), CircuitState.CLOSED);

  // Falha 2
  await assert.rejects(() => cb.execute(falhar), /Timeout 504/);
  assert.equal(cb.getState(), CircuitState.CLOSED);

  // Falha 3 -> Deve abrir o circuito
  await assert.rejects(() => cb.execute(falhar), /Timeout 504/);
  assert.equal(cb.getState(), CircuitState.OPEN);

  // Verifica se o listener de mudança de estado foi acionado
  assert.equal(stateChanges.length, 1);
  assert.deepEqual(stateChanges[0], { novo: CircuitState.OPEN, anterior: CircuitState.CLOSED });

  // 4ª chamada: Fail-fast imediato, a função interna NUNCA deve ser chamada
  let chamadaExecutada = false;
  await assert.rejects(
    () => cb.execute(async () => {
      chamadaExecutada = true;
      return 'nao-deve-rodar';
    }),
    CircuitBreakerOpenError
  );
  assert.equal(chamadaExecutada, false, 'A função não deve ser invocada quando o circuito está OPEN');
});

test('circuit-breaker: transita para HALF_OPEN após cooldown e recupera para CLOSED em caso de sucesso', async () => {
  const stateChanges = [];
  const cb = new CircuitBreaker({
    name: 'servico-viaturas',
    failureThreshold: 2,
    cooldownMs: 50,
    onStateChange: (novo, anterior) => stateChanges.push({ novo, anterior }),
  });

  // Força abertura
  cb.trip();
  assert.equal(cb.getState(), CircuitState.OPEN);

  // Aguarda expirar o cooldown de 50ms
  await new Promise(r => setTimeout(r, 60));

  // Ao consultar ou tentar executar, transita para HALF_OPEN
  assert.equal(cb.getState(), CircuitState.HALF_OPEN);

  // Executa uma chamada com sucesso (sondagem / probe)
  const res = await cb.execute(async () => 'recuperado');
  assert.equal(res, 'recuperado');

  // Circuito deve ter fechado (CLOSED)
  assert.equal(cb.getState(), CircuitState.CLOSED);
  assert.equal(cb.getStats().consecutiveFailures, 0);

  // Verifica histórico de transições
  assert.ok(stateChanges.some(s => s.novo === CircuitState.HALF_OPEN));
  assert.ok(stateChanges.some(s => s.novo === CircuitState.CLOSED && s.anterior === CircuitState.HALF_OPEN));
});

test('circuit-breaker: retorna para OPEN imediatamente se a sondagem em HALF_OPEN falhar', async () => {
  const cb = new CircuitBreaker({
    name: 'servico-viaturas',
    failureThreshold: 2,
    cooldownMs: 50,
  });

  cb.trip();
  await new Promise(r => setTimeout(r, 60));
  assert.equal(cb.getState(), CircuitState.HALF_OPEN);

  // Sondagem falha
  await assert.rejects(
    () => cb.execute(async () => { throw new Error('Serviço ainda fora do ar'); }),
    /Serviço ainda fora do ar/
  );

  // Volta imediatamente para OPEN
  assert.equal(cb.getState(), CircuitState.OPEN);
});
