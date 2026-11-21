'use strict';

/**
 * Estados do Circuit Breaker:
 * - CLOSED: Operação normal, requisições passam diretamente.
 * - OPEN: Falhas excederam o limiar, requisições falham imediatamente (fail-fast).
 * - HALF_OPEN: Período de teste, permite 1 requisição de sondagem para testar recuperação.
 */
const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

class CircuitBreakerOpenError extends Error {
  constructor(serviceName, nextAttempt) {
    const remaining = Math.max(0, Math.ceil((nextAttempt - Date.now()) / 1000));
    super(`Circuit breaker está ABERTO para o serviço '${serviceName}'. Nova tentativa permitida em ${remaining}s.`);
    this.name = 'CircuitBreakerOpenError';
    this.serviceName = serviceName;
    this.nextAttempt = nextAttempt;
    this.isCircuitBreakerOpen = true;
  }
}

class CircuitBreaker {
  /**
   * @param {Object} options
   * @param {string} [options.name='default'] - Nome do serviço protegido
   * @param {number} [options.failureThreshold=3] - Falhas consecutivas para abrir o circuito
   * @param {number} [options.cooldownMs=5000] - Tempo em milissegundos para transição OPEN -> HALF_OPEN
   * @param {Function} [options.onStateChange] - Callback chamado quando o estado muda (newState, oldState, stats)
   */
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 3;
    this.cooldownMs = options.cooldownMs || 5000;
    this.onStateChange = options.onStateChange || null;

    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.nextAttempt = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
  }

  getState() {
    if (this.state === CircuitState.OPEN && Date.now() >= this.nextAttempt) {
      this._setState(CircuitState.HALF_OPEN);
    }
    return this.state;
  }

  getStats() {
    return {
      name: this.name,
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      failureThreshold: this.failureThreshold,
      cooldownMs: this.cooldownMs,
      nextAttempt: this.nextAttempt,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }

  _setState(newState) {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;
    if (this.onStateChange) {
      try {
        this.onStateChange(newState, oldState, this.getStats());
      } catch {
        // Callbacks de notificação não devem propagar erros internos
      }
    }
  }

  /**
   * Força a abertura manual do circuito (útil em testes de injeção de falhas/caos).
   */
  trip() {
    this.consecutiveFailures = this.failureThreshold;
    this.nextAttempt = Date.now() + this.cooldownMs;
    this._setState(CircuitState.OPEN);
  }

  /**
   * Reseta o circuito para o estado CLOSED com contadores zerados.
   */
  reset() {
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.nextAttempt = 0;
    this._setState(CircuitState.CLOSED);
  }

  recordSuccess() {
    this.lastSuccessTime = new Date().toISOString();
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this._setState(CircuitState.CLOSED);
    }
  }

  recordFailure(err) {
    this.lastFailureTime = new Date().toISOString();
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;

    if (this.state === CircuitState.HALF_OPEN || this.consecutiveFailures >= this.failureThreshold) {
      this.nextAttempt = Date.now() + this.cooldownMs;
      this._setState(CircuitState.OPEN);
    }
  }

  /**
   * Executa uma função assíncrona protegida pelo Circuit Breaker.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async execute(fn) {
    const currentState = this.getState();

    if (currentState === CircuitState.OPEN) {
      throw new CircuitBreakerOpenError(this.name, this.nextAttempt);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure(err);
      throw err;
    }
  }
}

module.exports = {
  CircuitBreaker,
  CircuitBreakerOpenError,
  CircuitState,
};
