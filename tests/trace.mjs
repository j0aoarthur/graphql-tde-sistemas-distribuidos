// Integração: o rastro de decisão (Arena) reflete a disputa real entre workers.
// Requer a stack com SDV_DEMO_TRACE=1 no gateway, viaturas-service e dispatch-worker(s).
// Para ver disputa de fato, rode 2+ workers (SDV_WORKER_NAME=W1/W2/W3). Cria e cancela ocorrências [ARENA].
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
const require = createRequire(import.meta.url);
const { foldTrace, summarizeTrace, TRACE_CHANNEL } = require('../packages/shared/trace.cjs');
const password = process.env.DEMO_ADMIN_PASSWORD;
if (process.env.NODE_ENV !== 'test' || !password) throw Error('Exige NODE_ENV=test e DEMO_ADMIN_PASSWORD de ambiente isolado');
const API = process.env.GRAPHQL_URL ?? 'http://localhost:4010/graphql';
const N = Number(process.env.TRACE_CHAMADOS ?? 6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function query(gql, vars = {}, token = '') {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ query: gql, variables: vars }) });
  const body = await r.json(); if (body.errors?.length || !r.ok) throw new Error(JSON.stringify(body.errors ?? r.status)); return body.data;
}
const sub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'); const events = [];
sub.on('message', (_c, m) => events.push(JSON.parse(m))); await sub.subscribe(TRACE_CHANNEL);
const token = (await query('mutation($e:String!,$s:String!){login(email:$e,senha:$s){accessToken}}', { e: 'central-a@sdv.local', s: password })).login.accessToken;
const open = (i) => query('mutation($i:AbrirOcorrenciaInput!){abrirOcorrencia(input:$i){id}}', { i: { tipo: `Arena trace ${i}`, descricao: '[ARENA] teste de rastro', enderecoFormatado: 'Centro, Feira de Santana - BA', origemLocalizacao: 'PIN', precisaoLocalizacao: 'PONTO', localConfirmado: true, prioridade: 3, latitude: -12.2664, longitude: -38.9663, clientRequestId: randomUUID() } }, token);
let ids = [];
try {
  ids = (await Promise.all(Array.from({ length: N }, (_, i) => open(i + 1)))).map((x) => x.abrirOcorrencia.id);
  for (let i = 0; i < 40; i++) { // espera todos terminarem a alocação (VENCEU ou SEM_VIATURA)
    const mine = foldTrace(events.filter((e) => ids.includes(e.ocorrenciaId)));
    if (mine.length === N && mine.every((c) => c.status !== 'EM_DISPUTA')) break; await sleep(250);
  }
  const calls = foldTrace(events.filter((e) => ids.includes(e.ocorrenciaId))); const s = summarizeTrace(calls);
  assert.equal(calls.length, N, 'todo chamado deve ter rastro');
  for (const c of calls) {
    const seq = c.passos.map((p) => p.passo);
    assert.equal(seq[0], 'WORKER_RECEBEU', 'rastro começa no worker');
    assert.ok(seq.includes('ALOCACAO_INICIADA'), 'frota ranqueada');
    assert.ok(['VENCEU', 'SEM_VIATURA'].includes(seq.at(-1)), `termina em decisão (${seq.at(-1)})`);
    assert.ok(c.workers.length >= 1 && c.workers.every((w) => /^[\w-]+$/.test(w)));
    const win = seq.indexOf('VENCEU'); if (win >= 0) assert.ok(seq.slice(win + 1).every((x) => x === 'JA_DESPACHADA' || x === 'WORKER_RECEBEU'), 'nada depois de VENCEU');
    assert.ok(c.passos.every((p) => !('viaturaId' in p)), 'rastro nunca expõe UUID de viatura');
  }
  assert.equal(s.viaturasRepetidas, 0, 'nenhuma viatura vencida por dois chamados');
  assert.equal(s.despachados + s.emEspera, N);
  console.table(calls.map((c) => ({ chamado: c.ocorrenciaId.slice(0, 6), status: c.status, viatura: c.viaturaCodigo ? `VTR-${String(c.viaturaCodigo).padStart(3, '0')}` : '—', workers: c.workers.join(','), bloqueios: JSON.stringify(c.bloqueios), ms: c.duracaoMs })));
  console.log('PASSOU: rastro consistente —', s);
} finally {
  for (const id of ids) await query('mutation($id:ID!){cancelarOcorrencia(id:$id,motivo:"Limpeza do teste de rastro"){id}}', { id }, token).catch(() => {});
  await sleep(1500); await sub.quit();
}
