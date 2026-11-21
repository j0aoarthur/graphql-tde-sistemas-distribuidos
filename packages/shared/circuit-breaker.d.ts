export type CircuitStateType = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStats {
  name: string;
  state: CircuitStateType;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  failureThreshold: number;
  cooldownMs: number;
  nextAttempt: number;
  lastFailureTime: string | null;
  lastSuccessTime: string | null;
}

export interface CircuitBreakerOptions {
  name?: string;
  failureThreshold?: number;
  cooldownMs?: number;
  onStateChange?: (newState: CircuitStateType, oldState: CircuitStateType, stats: CircuitBreakerStats) => void;
}

export declare class CircuitBreakerOpenError extends Error {
  serviceName: string;
  nextAttempt: number;
  isCircuitBreakerOpen: boolean;
  constructor(serviceName: string, nextAttempt: number);
}

export declare class CircuitBreaker {
  name: string;
  failureThreshold: number;
  cooldownMs: number;
  state: CircuitStateType;
  constructor(options?: CircuitBreakerOptions);
  getState(): CircuitStateType;
  getStats(): CircuitBreakerStats;
  trip(): void;
  reset(): void;
  recordSuccess(): void;
  recordFailure(err?: any): void;
  execute<T>(fn: () => Promise<T>): Promise<T>;
}

export declare const CircuitState: {
  CLOSED: 'CLOSED';
  OPEN: 'OPEN';
  HALF_OPEN: 'HALF_OPEN';
};
