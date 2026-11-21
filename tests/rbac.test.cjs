'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'segredo-de-teste-para-validacao-rbac-super-seguro-32-chars';

function signToken(papel, centralId = 'central-01', sub = 'user-01') {
  return jwt.sign({ centralId, papel }, JWT_SECRET, { subject: sub, expiresIn: '15m', algorithm: 'HS256' });
}

// Simula a verificação RBAC implementada nos subgrafos
function authenticate(token, secret) {
  if (!token) throw new Error('Autenticação necessária');
  const claims = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (!['ADMIN', 'SUPERVISOR', 'OPERADOR'].includes(claims.papel) || !claims.sub || !claims.centralId) {
    throw new Error('Invalid claims');
  }
  return { sub: String(claims.sub), centralId: String(claims.centralId), papel: String(claims.papel) };
}

function requireRole(token, secret, allowedRoles) {
  const actor = authenticate(token, secret);
  if (!allowedRoles.includes(actor.papel)) {
    const err = new Error(`Acesso negado: o papel '${actor.papel}' não possui permissão.`);
    err.status = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }
  return actor;
}

test('rbac: autenticação valida tokens JWT legítimos e rejeita papéis inválidos ou forjados', () => {
  const tokenAdmin = signToken('ADMIN');
  const tokenSuper = signToken('SUPERVISOR');
  const tokenOp = signToken('OPERADOR');
  const tokenHacker = jwt.sign({ papel: 'ROOT', centralId: 'c1' }, JWT_SECRET, { subject: 'u1' });

  assert.equal(authenticate(tokenAdmin, JWT_SECRET).papel, 'ADMIN');
  assert.equal(authenticate(tokenSuper, JWT_SECRET).papel, 'SUPERVISOR');
  assert.equal(authenticate(tokenOp, JWT_SECRET).papel, 'OPERADOR');

  assert.throws(() => authenticate(tokenHacker, JWT_SECRET), /Invalid claims/);
  assert.throws(() => authenticate('token-invalido', JWT_SECRET));
  assert.throws(() => authenticate('', JWT_SECRET), /Autenticação necessária/);
});

test('rbac: ADMIN tem acesso total a todas as mutações e consultas', () => {
  const tokenAdmin = signToken('ADMIN');

  // Mutações restritas a ADMIN
  assert.doesNotThrow(() => requireRole(tokenAdmin, JWT_SECRET, ['ADMIN'])); // cadastrarViatura, configurarSimulacao, simularFalhaGps
  // Mutações de SUPERVISOR / ADMIN
  assert.doesNotThrow(() => requireRole(tokenAdmin, JWT_SECRET, ['ADMIN', 'SUPERVISOR'])); // encerrarOcorrencia, cancelarOcorrencia
  // Mutações abertas a todos os autenticados
  assert.doesNotThrow(() => requireRole(tokenAdmin, JWT_SECRET, ['ADMIN', 'SUPERVISOR', 'OPERADOR'])); // abrirOcorrencia
});

test('rbac: SUPERVISOR pode abrir, encerrar e cancelar ocorrências, mas NÃO pode cadastrar viaturas ou alterar simulação', () => {
  const tokenSuper = signToken('SUPERVISOR');

  // Permitido: abrir, encerrar, cancelar ocorrências e pausar despacho
  assert.doesNotThrow(() => requireRole(tokenSuper, JWT_SECRET, ['ADMIN', 'SUPERVISOR', 'OPERADOR'])); // abrir
  assert.doesNotThrow(() => requireRole(tokenSuper, JWT_SECRET, ['ADMIN', 'SUPERVISOR'])); // encerrar, cancelar

  // Proibido: cadastrar viatura, alterar fator de simulação, simular falha GPS
  assert.throws(
    () => requireRole(tokenSuper, JWT_SECRET, ['ADMIN']),
    (err) => err.status === 403 && /Acesso negado/.test(err.message)
  );
});

test('rbac: OPERADOR pode abrir ocorrências e consultar dados, mas NÃO pode encerrar nem cancelar ocorrências', () => {
  const tokenOp = signToken('OPERADOR');

  // Permitido: abrir ocorrência e consultas
  assert.doesNotThrow(() => requireRole(tokenOp, JWT_SECRET, ['ADMIN', 'SUPERVISOR', 'OPERADOR']));

  // Proibido: encerrar ou cancelar ocorrências (retorna 403 Forbidden)
  assert.throws(
    () => requireRole(tokenOp, JWT_SECRET, ['ADMIN', 'SUPERVISOR']),
    (err) => err.status === 403 && /Acesso negado: o papel 'OPERADOR'/.test(err.message)
  );

  // Proibido: cadastrar viaturas
  assert.throws(
    () => requireRole(tokenOp, JWT_SECRET, ['ADMIN']),
    (err) => err.status === 403
  );
});
