// Rastro efêmero da decisão de despacho, usado SOMENTE na demonstração de concorrência (Arena).
// Desligado por padrão (SDV_DEMO_TRACE=1 liga). Não carrega UUID de viatura nem dado pessoal:
// apenas o código de referência (VTR-001), o rótulo do worker e o passo executado.
// É Pub/Sub transitório: a verdade continua no PostgreSQL; a UI reconcilia via GraphQL.
const TRACE_CHANNEL='sdv:trace';
// passo -> camada que tomou a decisão
const PASSOS={
  WORKER_RECEBEU:'STREAM',     // worker pegou o chamado (stream ou fila de espera)
  ALOCACAO_INICIADA:'FROTA',   // lista de viaturas livres ranqueada
  LOCK_OCUPADO:'REDIS',        // lock NX da viatura já estava com outro worker -> tenta a próxima
  CAS_PERDEU:'POSTGRES',       // UPDATE ... WHERE status='DISPONIVEL' afetou 0 linhas
  INDICE_RECUSOU:'INDICE',     // índice único parcial recusou (P2002) um 2º despacho ativo
  VENCEU:'POSTGRES',           // viatura alocada (CAS ok + despacho criado na mesma transação)
  JA_DESPACHADA:'IDEMPOTENCIA',// reprocessamento at-least-once: já existia despacho
  SEM_VIATURA:'FILA',          // nenhuma livre -> AGUARDANDO_VIATURA
};
const BLOQUEIOS={LOCK_OCUPADO:'lock',CAS_PERDEU:'cas',INDICE_RECUSOU:'indice'};
const traceEnabled=(env=process.env)=>env.SDV_DEMO_TRACE==='1';
const safeText=(v,max)=>typeof v==='string'&&/^[\w .:/-]+$/.test(v)?v.slice(0,max):undefined;
function makeTrace(p,now=Date.now()){
  if(!p||!(p.passo in PASSOS))throw Error('Passo de rastro inválido');
  if(typeof p.ocorrenciaId!=='string'||!/^[0-9a-f-]{36}$/i.test(p.ocorrenciaId))throw Error('ocorrenciaId inválido');
  const out={ocorrenciaId:p.ocorrenciaId,passo:p.passo,camada:PASSOS[p.passo],ts:new Date(now).toISOString()};
  const worker=safeText(p.worker,16);if(worker)out.worker=worker;
  if(Number.isInteger(p.viaturaCodigo)&&p.viaturaCodigo>0)out.viaturaCodigo=p.viaturaCodigo;
  const detalhe=safeText(p.detalhe,40);if(detalhe)out.detalhe=detalhe;
  if(Number.isFinite(p.ms)&&p.ms>=0)out.ms=Math.round(p.ms);
  return out;
}
// Dobra os eventos (em qualquer ordem de chegada) no estado de cada chamado.
function foldTrace(events){
  const calls=new Map();
  const sorted=[...events].map((e,i)=>({e,i})).sort((a,b)=>a.e.ts<b.e.ts?-1:a.e.ts>b.e.ts?1:a.i-b.i).map(x=>x.e);
  for(const e of sorted){
    if(!e||!(e.passo in PASSOS))continue;
    let c=calls.get(e.ocorrenciaId);
    if(!c){c={ocorrenciaId:e.ocorrenciaId,status:'EM_DISPUTA',workers:[],passos:[],bloqueios:{lock:0,cas:0,indice:0},viaturaCodigo:null,iniciouEm:e.ts,terminouEm:null,duracaoMs:null,esperaMs:0,tentativaEm:e.ts};calls.set(e.ocorrenciaId,c);}
    c.passos.push(e);
    if(e.passo==='WORKER_RECEBEU')c.tentativaEm=e.ts; // início da tentativa atual (a fila reinicia a contagem)
    if(e.worker&&!c.workers.includes(e.worker))c.workers.push(e.worker);
    if(e.passo in BLOQUEIOS)c.bloqueios[BLOQUEIOS[e.passo]]++;
    if(e.passo==='VENCEU'||e.passo==='JA_DESPACHADA'){
      c.status='DESPACHADA';if(e.viaturaCodigo)c.viaturaCodigo=e.viaturaCodigo;
      c.terminouEm=e.ts;c.duracaoMs=Date.parse(e.ts)-Date.parse(c.tentativaEm); // latência de DECISÃO (sem o tempo parado na fila)
      c.esperaMs=Date.parse(c.tentativaEm)-Date.parse(c.iniciouEm);
    }else if(e.passo==='SEM_VIATURA'&&c.status!=='DESPACHADA')c.status='EM_ESPERA';
  }
  return [...calls.values()];
}
function summarizeTrace(calls){
  const s={chamados:calls.length,despachados:0,emEspera:0,emDisputa:0,bloqueios:{lock:0,cas:0,indice:0},viaturasDistintas:0,viaturasRepetidas:0,duracoesMs:[]};
  const seen=new Map();
  for(const c of calls){
    if(c.status==='DESPACHADA')s.despachados++;else if(c.status==='EM_ESPERA')s.emEspera++;else s.emDisputa++;
    for(const k of Object.keys(s.bloqueios))s.bloqueios[k]+=c.bloqueios[k];
    if(c.status==='DESPACHADA'&&c.viaturaCodigo){seen.set(c.viaturaCodigo,(seen.get(c.viaturaCodigo)??0)+1);}
    if(c.duracaoMs!=null)s.duracoesMs.push(c.duracaoMs);
  }
  s.viaturasDistintas=seen.size;s.viaturasRepetidas=[...seen.values()].filter(n=>n>1).length;
  s.duracoesMs.sort((a,b)=>a-b);
  const pct=q=>s.duracoesMs.length?s.duracoesMs[Math.min(s.duracoesMs.length-1,Math.ceil(q*s.duracoesMs.length)-1)]:null;
  s.p50Ms=pct(.5);s.p95Ms=pct(.95);delete s.duracoesMs;return s;
}
module.exports={TRACE_CHANNEL,PASSOS,traceEnabled,makeTrace,foldTrace,summarizeTrace};
