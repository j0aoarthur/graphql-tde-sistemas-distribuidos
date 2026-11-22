'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

// Auto-carrega variáveis de ambiente do .env para desenvolvimento local
try {
  const dotenv = require('dotenv');
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
} catch {
  // Ignora se dotenv não estiver disponível (ex: produção com envs injetadas pelo container)
}

const storage = new AsyncLocalStorage();

function getContext() {
  return storage.getStore() || {};
}

function getCorrelationId() {
  const ctx = getContext();
  return ctx.correlationId || null;
}

function runWithContext(context, fn) {
  const parent = getContext();
  const merged = { ...parent, ...context };
  if (!merged.correlationId && context.correlationId) {
    merged.correlationId = context.correlationId;
  }
  return storage.run(merged, fn);
}

function serializeError(err) {
  if (!err) return undefined;
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, name: err.name };
  }
  return err;
}

function output(level, message, meta = {}, defaultService = 'sdv') {
  const ctx = getContext();
  const service = meta.service || ctx.service || defaultService || process.env.SDV_SERVICE_NAME || 'sdv';
  const correlationId = meta.correlationId || ctx.correlationId || null;

  let extra = {};
  if (meta instanceof Error) {
    extra = { error: serializeError(meta) };
  } else if (typeof meta === 'object' && meta !== null) {
    extra = { ...meta };
    if (extra.error instanceof Error) {
      extra.error = serializeError(extra.error);
    }
  } else if (meta !== undefined) {
    extra = { meta };
  }

  // Remove campos já representados no topo para evitar duplicidade
  delete extra.service;
  delete extra.correlationId;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service,
    ...(correlationId ? { correlationId } : {}),
    message: String(message),
    ...(Object.keys(extra).length > 0 ? extra : {})
  };

  const line = JSON.stringify(entry);
  if (level === 'ERROR') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
  return entry;
}

function createLogger(serviceName) {
  const sName = serviceName || process.env.SDV_SERVICE_NAME || 'sdv';
  return {
    info: (msg, meta) => output('INFO', msg, meta, sName),
    warn: (msg, meta) => output('WARN', msg, meta, sName),
    error: (msg, meta) => output('ERROR', msg, meta, sName),
    debug: (msg, meta) => output('DEBUG', msg, meta, sName),
    withContext: (ctx, fn) => runWithContext({ service: sName, ...ctx }, fn),
    getContext,
    getCorrelationId,
  };
}

const defaultLogger = createLogger(process.env.SDV_SERVICE_NAME || 'sdv');

module.exports = {
  ...defaultLogger,
  createLogger,
  runWithContext,
  getContext,
  getCorrelationId,
  randomUUID,
};
