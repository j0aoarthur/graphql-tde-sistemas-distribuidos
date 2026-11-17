// Integração da Arena de concorrência: N chamados simultâneos disputando K viaturas livres.
// Requer: npm run demo:arena (SDV_DEMO_TRACE=1, SDV_DEMO_MODE=1, 2+ workers). Altera o ambiente de DEMO e restaura ao final.
// Prova: despachados = K, em espera = N-K, nenhuma viatura repetida, e a fila drena na hora (<8 s, não 15 s)
// quando uma viatura é liberada — respeitando prioridade e antiguidade.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
const require = createRequire(import.meta.url);
const { foldTrace, summarizeTrace, TRACE_CHANNEL } = require('../packages/shared/trace.cjs');
const password = process.env.DEMO_ADMIN_PASSWORD;
if (process.env.NODE_ENV !== 'test' || !password) throw Error('Exige NODE_ENV=test e DEMO_ADMIN_PASSWORD de ambiente isolado');
const API = process.env.GRAPHQL_URL ?? 'http://localhost:4010/graphql';
const N = Number(process.env.ARENA_CHAMADOS ?? 8), K = Number(process.env.ARENA_LIVRES ?? 3);
const SEM_LOCK = process.env.ARENA_SEM_LOCK === '1'; // prova: só o PostgreSQL (CAS + índice único) impede a duplicidade
const POINT = { latitude: -12.2664, longitude: -38.9663 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function query(gql, vars = {}, token = '') {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ query: gql, variables: vars }) });
  const body = await r.json(); if (body.errors?.length || !r.ok) throw new Error(JSON.stringify(body.errors ?? r.status)); return body.data;
}
const waitFor = async (what, fn, ms = 20000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await fn(); if (last) return last; await sleep(250); } throw new Error(`Tempo esgotado: ${what}`); };
const sub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'); const events = [];
sub.on('message', (_c, m) => events.push(JSON.parse(m))); await sub.subscribe(TRACE_CHANNEL);
const token = (await query('mutation($e:String!,$s:String!){login(email:$e,senha:$s){accessToken}}', { e: 'central-a@sdv.local', s: password })).login.accessToken;
const open = (i) => query('mutation($i:AbrirOcorrenciaInput!){abrirOcorrencia(input:$i){id}}', { i: { tipo: `Arena chamado ${String(i).padStart(2, '0')}`, descricao: '[ARENA] teste de concorrência', enderecoFormatado: 'Centro, Feira de Santana - BA', origemLocalizacao: 'PIN', precisaoLocalizacao: 'PONTO', localConfirmado: true, prioridade: 3, ...POINT, clientRequestId: randomUUID() } }, token);
const mine = async (ids) => (await query('query{listarOcorrencias{id status viaturaId criadoEm}}', {}, token)).listarOcorrencias.filter((o) => ids.includes(o.id));
let ids = [];
try {
  const est = (await query('query{estadoArena{modoDemo rastroAtivo workers livres reservadas}}', {}, token)).estadoArena;
  assert.ok(est.modoDemo && est.rastroAtivo, 'Suba com npm run demo:arena (SDV_DEMO_MODE=1 e SDV_DEMO_TRACE=1)');
  console.log(`Ambiente: ${est.workers} worker(s) vivos, ${est.livres} viaturas livres.`);
  const prep = (await query('mutation($k:Int!,$a:Float!,$b:Float!){prepararArena(livres:$k,latitude:$a,longitude:$b){livres reservadas}}', { k: K, a: POINT.latitude, b: POINT.longitude }, token)).prepararArena;
  assert.equal(prep.livres, K, `deve restar exatamente ${K} viaturas livres`);
  if (SEM_LOCK) { const c = (await query('mutation{configurarArena(lockRedis:false){lockRedis}}', {}, token)).configurarArena; assert.equal(c.lockRedis, false); console.log('⚠ Lock do Redis DESLIGADO: só PostgreSQL decide.'); }
  console.log(`Cenário: ${prep.livres} livres, ${prep.reservadas} reservadas. Disparando ${N} chamados simultâneos…`);

  ids = (await Promise.all(Array.from({ length: N }, (_, i) => open(i + 1)))).map((x) => x.abrirOcorrencia.id);
  const settled = await waitFor('K despachados e N-K em espera', async () => { const o = await mine(ids); return o.filter((x) => x.status === 'DESPACHADA').length === K && o.filter((x) => x.status === 'AGUARDANDO_VIATURA').length === N - K ? o : null; });
  const dispatched = settled.filter((o) => o.status === 'DESPACHADA'), waiting = settled.filter((o) => o.status === 'AGUARDANDO_VIATURA');
  assert.equal(new Set(dispatched.map((o) => o.viaturaId)).size, K, 'nenhuma viatura alocada para dois chamados');
  const deps = (await query('query{listarDespachos{ocorrenciaId viaturaId status}}', {}, token)).listarDespachos.filter((d) => ids.includes(d.ocorrenciaId) && !['CONCLUIDO', 'CANCELADO'].includes(d.status));
  assert.equal(deps.length, K); assert.equal(new Set(deps.map((d) => d.viaturaId)).size, deps.length, 'banco: nenhuma viatura com 2 despachos ativos');
  const s = summarizeTrace(foldTrace(events.filter((e) => ids.includes(e.ocorrenciaId))));
  assert.equal(s.viaturasRepetidas, 0);
  if (SEM_LOCK) assert.equal(s.bloqueios.lock, 0, 'sem lock do Redis não há LOCK_OCUPADO');
  console.log(`✔ ${K} despachados, ${N - K} em espera, 0 duplicadas. Tentativas barradas: lock Redis ${s.bloqueios.lock} · CAS ${s.bloqueios.cas} · índice único ${s.bloqueios.indice}`);

  // Libera uma viatura: o chamado em espera MAIS ANTIGO deve ser despachado logo (não esperar o ciclo de 15 s).
  const oldest = [...waiting].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id))[0]; // desempate = o da fila (criadoEm, id)
  const t0 = Date.now();
  await query('mutation($id:ID!){cancelarOcorrencia(id:$id,motivo:"Liberando viatura no teste da arena"){id}}', { id: dispatched[0].id }, token);
  await waitFor('fila drenar', async () => (await mine([oldest.id]))[0]?.status === 'DESPACHADA', 8000);
  const took = Date.now() - t0;
  console.log(`✔ Viatura liberada → chamado mais antigo da fila despachado em ${took} ms (ciclo antigo: até 15000 ms)`);
  assert.ok(took < 8000);
  console.log('\nPASSOU: arena — disputa N×K sem duplicidade e fila drenada imediatamente');
} finally {
  for (const id of ids) await query('mutation($id:ID!){cancelarOcorrencia(id:$id,motivo:"Limpeza do teste da arena"){id}}', { id }, token).catch(() => {});
  await sleep(2500);
  for (let i = 0; i < 6; i++) { const o = await mine(ids).catch(() => []); if (o.every((x) => x.status === 'CANCELADA')) break; await sleep(1000); }
  await query('mutation{restaurarArena{livres reservadas}}', {}, token).then((r) => console.log('Viaturas restauradas:', r.restaurarArena)).catch((e) => console.error('FALHA ao restaurar:', e.message));
  await sub.quit();
}
