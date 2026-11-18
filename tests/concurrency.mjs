// Teste API E2E de concorrência real: executar SOMENTE contra ambiente de testes isolado.
//
// Cenário: duas centrais (A e B) abrem, no mesmo instante e no mesmo ponto, uma ocorrência cada.
// As duas disputam a viatura livre mais próxima. A garantia testada é que NENHUMA viatura
// seja alocada para as duas (atualização condicional + unicidade no PostgreSQL).
//
// Uso:
//   npm run test:concurrency        # roda, valida e limpa (modo CI)
//   npm run test:concurrency:tela   # mantém as ocorrências visíveis no painel por 3 min
//   MANTER_SEGUNDOS=600 npm run test:concurrency:tela   # tempo customizado
//   Ctrl+C durante a espera cancela as ocorrências de teste e sai.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const password = process.env.DEMO_ADMIN_PASSWORD;
if (process.env.NODE_ENV !== 'test' || !password) throw Error('Exige NODE_ENV=test e DEMO_ADMIN_PASSWORD de ambiente isolado');

const arg = process.argv.find((a) => a.startsWith('--manter'));
const keepSeconds = arg ? Number(arg.split('=')[1] ?? 180) : Number(process.env.MANTER_SEGUNDOS ?? 0);
const PAINEL = process.env.PAINEL_URL ?? 'http://localhost:5173';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hora = () => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia' });
const log = (msg = '') => console.log(msg);
const step = (n, title) => log(`\n[${n}] ${title}`);
const ok = (msg) => log(`    ✔ ${msg}`);
const info = (msg) => log(`    · ${msg}`);

// ── Descobre o gateway do SDV (4000 pode estar com outro projeto) ───────────────────────────
async function findApi() {
  const candidates = process.env.GRAPHQL_URL ? [process.env.GRAPHQL_URL] : ['http://localhost:4000/graphql', 'http://localhost:4010/graphql'];
  for (const url of candidates) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{__typename}' }), signal: AbortSignal.timeout(3000) });
      const body = JSON.parse(await r.text());
      if (body?.data?.__typename === 'Query') return url;
    } catch { /* tenta o próximo */ }
  }
  throw new Error(`Gateway GraphQL do SDV não encontrado (testado: ${candidates.join(', ')}). Suba a stack ou defina GRAPHQL_URL.`);
}
const API = await findApi();

async function query(gql, vars = {}, token = '') {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ query: gql, variables: vars }) });
  const body = await r.json();
  if (body.errors?.length || !r.ok) throw new Error(JSON.stringify(body.errors ?? r.status));
  return body.data;
}
async function login(email) {
  const { login } = await query('mutation($email:String!,$senha:String!){login(email:$email,senha:$senha){accessToken admin{nome centralId}}}', { email, senha: password });
  return login;
}

const PRIORIDADE = { 1: 'baixa', 2: 'média', 3: 'alta', 4: 'crítica' };
const created = []; // { id, token, central } — para limpar mesmo se algo falhar
let cleaning = false;
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  if (!created.length) return;
  step('•', 'Limpeza: cancelando as ocorrências de teste (libera as viaturas)');
  for (const c of created) {
    try { await query('mutation($id:ID!){cancelarOcorrencia(id:$id,motivo:"Limpeza do teste concorrente"){id}}', { id: c.id }, c.token); } catch (e) { info(`aviso: não foi possível cancelar ${c.id}: ${e.message}`); }
  }
  for (const c of created) {
    let status = '';
    for (let n = 0; n < 40; n++) {
      status = (await query('query($id:ID!){consultarOcorrencia(id:$id){status}}', { id: c.id }, created[0].token)).consultarOcorrencia.status;
      if (status === 'CANCELADA') break;
      await sleep(250);
    }
    assert.equal(status, 'CANCELADA', 'limpeza libera recursos antes do próximo cenário');
    ok(`${c.central}: ocorrência ${c.id.slice(0, 8)} → CANCELADA`);
  }
}
process.on('SIGINT', async () => { log('\n    Interrompido (Ctrl+C).'); try { await cleanup(); } finally { process.exit(130); } });

try {
  log('═══ Teste de concorrência SDV ═══════════════════════════════════════════');
  log('Duas centrais abrem uma ocorrência cada, no MESMO instante e em pontos a ~100 m um do outro.');
  log('Esperado: 1 viatura por ocorrência, e as duas viaturas DIFERENTES entre si.');
  info(`API: ${API}`);
  info(keepSeconds > 0 ? `Modo tela: ocorrências ficam visíveis por ${keepSeconds}s em ${PAINEL}` : 'Modo rápido: valida e limpa (use "npm run test:concurrency:tela" para ver no painel)');

  step(1, 'Login das duas centrais');
  const [A, B] = await Promise.all([login('central-a@sdv.local'), login('central-b@sdv.local')]);
  const [a, b] = [A.accessToken, B.accessToken];
  const centrais = (await query('query{listarCentrais{id codigo nome}}', {}, a)).listarCentrais;
  const centralName = (id) => centrais.find((c) => c.id === id)?.nome ?? 'Central';
  const nameA = centralName(A.admin.centralId), nameB = centralName(B.admin.centralId);
  ok(`Central A: ${nameA} (${A.admin.nome})`);
  ok(`Central B: ${nameB} (${B.admin.nome})`);

  step(2, 'Abrindo as duas ocorrências em paralelo');
  const base = { origemLocalizacao: 'PIN', precisaoLocalizacao: 'PONTO', localConfirmado: true, prioridade: 3, bairro: 'Centro' };
  const gql = 'mutation($input:AbrirOcorrenciaInput!){abrirOcorrencia(input:$input){id status}}';
  const t0 = Date.now();
  const [one, two] = await Promise.all([
    query(gql, { input: { ...base, tipo: `Teste ${nameA}`, enderecoFormatado: 'Av. Getúlio Vargas, Centro, Feira de Santana - BA', descricao: `[TESTE] Concorrência — ocorrência 1 de 2, aberta pela ${nameA}`, latitude: -12.2664, longitude: -38.9663, clientRequestId: randomUUID() } }, a),
    query(gql, { input: { ...base, tipo: `Teste ${nameB}`, enderecoFormatado: 'Av. Getúlio Vargas, Centro, Feira de Santana - BA', descricao: `[TESTE] Concorrência — ocorrência 2 de 2, aberta pela ${nameB}`, latitude: -12.2670, longitude: -38.9655, clientRequestId: randomUUID() } }, b),
  ]);
  created.push({ id: one.abrirOcorrencia.id, token: a, central: nameA }, { id: two.abrirOcorrencia.id, token: b, central: nameB });
  assert.notEqual(one.abrirOcorrencia.id, two.abrirOcorrencia.id);
  ok(`Ambas aceitas em ${Date.now() - t0} ms (status inicial: ${one.abrirOcorrencia.status} / ${two.abrirOcorrencia.status})`);
  info(`${nameA}: ${one.abrirOcorrencia.id}`);
  info(`${nameB}: ${two.abrirOcorrencia.id}`);

  step(3, 'Aguardando o dispatch-worker alocar as viaturas');
  const ids = new Set(created.map((c) => c.id));
  let received = [];
  for (let i = 0; i < 30; i++) {
    const data = await query('query{listarOcorrencias{id status viaturaId}}', {}, a);
    received = data.listarOcorrencias.filter((x) => ids.has(x.id));
    if (received.length === 2 && received.every((x) => x.status === 'DESPACHADA' || x.status === 'AGUARDANDO_VIATURA')) break;
    await sleep(500);
  }
  assert.equal(received.length, 2, 'ocorrências criadas devem persistir');
  assert.ok(received.every((x) => x.status === 'DESPACHADA' || x.status === 'AGUARDANDO_VIATURA'), 'workers devem processar eventos');

  let fleet = [];
  try { fleet = (await query('query{listarViaturas{id codigo placa}}', {}, a)).listarViaturas; } catch { /* só enriquece a saída */ }
  const label = (id) => { const v = fleet.find((x) => x.id === id); return v ? `VTR-${String(v.codigo).padStart(3, '0')} (${v.placa})` : id ? id.slice(0, 8) : '—'; };
  const rows = created.map((c, i) => { const r = received.find((x) => x.id === c.id); return { Central: c.central, Ocorrência: c.id.slice(0, 8), Status: r.status, Viatura: label(r.viaturaId) }; });
  console.table(rows);

  step(4, 'Verificando que nenhuma viatura foi alocada duas vezes');
  const assigned = received.map((x) => x.viaturaId).filter(Boolean);
  assert.equal(new Set(assigned).size, assigned.length, 'nenhuma viatura alocada duas vezes');
  ok(`${assigned.length} viatura(s) alocada(s), todas distintas`);
  log('\nPASSOU: duas centrais, concorrência GraphQL, nenhuma viatura duplicada');

  if (keepSeconds > 0) {
    step(5, 'Ocorrências visíveis no painel');
    info(`Abra ${PAINEL} e entre com central-a@sdv.local (ou central-b@sdv.local).`);
    info('Procure por "Teste Central Norte" e "Teste Central Sul" (prioridade alta) na Fila de atendimento e no mapa, no Centro.');
    info('Cada ocorrência tem UMA viatura própria (veja a tabela acima); as duas se deslocam no mapa até o local.');
    info('Só a central de origem pode encerrar/cancelar cada ocorrência.');
    const end = Date.now() + keepSeconds * 1000;
    while (Date.now() < end) {
      const left = Math.ceil((end - Date.now()) / 1000);
      process.stdout.write(`\r    ⏳ ${hora()} — limpeza automática em ${String(left).padStart(3)}s  (Ctrl+C para limpar agora)   `);
      await sleep(1000);
    }
    process.stdout.write('\n');
  }
} finally {
  await cleanup();
}
log('\nConcluído.');
