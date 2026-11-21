export interface LogContext {
  correlationId?: string;
  service?: string;
  [key: string]: any;
}

export interface Logger {
  info(message: string, meta?: any): Record<string, any>;
  warn(message: string, meta?: any): Record<string, any>;
  error(message: string, errorOrMeta?: any): Record<string, any>;
  debug(message: string, meta?: any): Record<string, any>;
  withContext<T>(context: LogContext, fn: () => T): T;
  getContext(): LogContext;
  getCorrelationId(): string | null;
}

export declare const info: (message: string, meta?: any) => Record<string, any>;
export declare const warn: (message: string, meta?: any) => Record<string, any>;
export declare const error: (message: string, errorOrMeta?: any) => Record<string, any>;
export declare const debug: (message: string, meta?: any) => Record<string, any>;
export declare const withContext: <T>(context: LogContext, fn: () => T) => T;
export declare const runWithContext: <T>(context: LogContext, fn: () => T) => T;
export declare const getContext: () => LogContext;
export declare const getCorrelationId: () => string | null;
export declare const createLogger: (serviceName?: string) => Logger;
export declare const randomUUID: () => string;
