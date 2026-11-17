const {test}=require('node:test');const assert=require('node:assert/strict');
const {makeTrace,foldTrace,summarizeTrace,traceEnabled,TRACE_CHANNEL}=require('../packages/shared/trace.cjs');
const O=n=>`00000000-0000-4000-8000-00000000000${n}`;
const at=(ms)=>1_700_000_000_000+ms;
const ev=(n,passo,ms,extra={})=>makeTrace({ocorrenciaId:O(n),passo,worker:'W1',...extra},at(ms));
test('só liga com SDV_DEMO_TRACE=1 e usa canal próprio',()=>{
 assert.equal(traceEnabled({}),false);assert.equal(traceEnabled({SDV_DEMO_TRACE:'0'}),false);assert.equal(traceEnabled({SDV_DEMO_TRACE:'1'}),true);assert.equal(TRACE_CHANNEL,'sdv:trace');
});
test('makeTrace valida passo e id, descarta texto livre perigoso e não expõe UUID de viatura',()=>{
 assert.throws(()=>makeTrace({ocorrenciaId:O(1),passo:'INVENTADO'}));
 assert.throws(()=>makeTrace({ocorrenciaId:'x',passo:'VENCEU'}));
 const e=makeTrace({ocorrenciaId:O(1),passo:'VENCEU',worker:'<script>',viaturaCodigo:9,viaturaId:'segredo-uuid',detalhe:'ok'},at(0));
 assert.equal(e.worker,undefined);assert.equal(e.viaturaCodigo,9);assert.equal(e.camada,'POSTGRES');assert.equal('viaturaId' in e,false);assert.equal(e.detalhe,'ok');
});
test('foldTrace ordena por tempo, conta bloqueios por camada e fecha em DESPACHADA',()=>{
 const calls=foldTrace([ev(1,'VENCEU',30,{viaturaCodigo:9}),ev(1,'WORKER_RECEBEU',0),ev(1,'LOCK_OCUPADO',10,{viaturaCodigo:9}),ev(1,'CAS_PERDEU',20,{viaturaCodigo:7})]);
 assert.equal(calls.length,1);const [c]=calls;
 assert.deepEqual(c.passos.map(p=>p.passo),['WORKER_RECEBEU','LOCK_OCUPADO','CAS_PERDEU','VENCEU']);
 assert.deepEqual(c.bloqueios,{lock:1,cas:1,indice:0});assert.equal(c.status,'DESPACHADA');assert.equal(c.viaturaCodigo,9);assert.equal(c.duracaoMs,30);
});
test('chamado sem viatura fica EM_ESPERA e depois vira DESPACHADA quando uma é liberada',()=>{
 const wait=foldTrace([ev(2,'WORKER_RECEBEU',0),ev(2,'SEM_VIATURA',5)]);assert.equal(wait[0].status,'EM_ESPERA');
 const later=foldTrace([ev(2,'WORKER_RECEBEU',0),ev(2,'SEM_VIATURA',5),ev(2,'WORKER_RECEBEU',900,{detalhe:'FILA'}),ev(2,'VENCEU',910,{viaturaCodigo:3})]);
 assert.equal(later[0].status,'DESPACHADA');assert.equal(later[0].viaturaCodigo,3);
});
test('duracaoMs mede só a decisão da última tentativa; o tempo parado na fila vai para esperaMs',()=>{
 const [c]=foldTrace([ev(4,'WORKER_RECEBEU',0),ev(4,'SEM_VIATURA',5),ev(4,'WORKER_RECEBEU',4000,{detalhe:'FILA'}),ev(4,'VENCEU',4012,{viaturaCodigo:2})]);
 assert.equal(c.duracaoMs,12);assert.equal(c.esperaMs,4000);
});
test('summarizeTrace: totais, bloqueios, percentis e detecção de viatura repetida',()=>{
 const base=[...[1,2,3].flatMap(n=>[ev(n,'WORKER_RECEBEU',0)]),ev(1,'VENCEU',10,{viaturaCodigo:9}),ev(2,'LOCK_OCUPADO',4,{viaturaCodigo:9}),ev(2,'VENCEU',40,{viaturaCodigo:7}),ev(3,'SEM_VIATURA',8)];
 const s=summarizeTrace(foldTrace(base));
 assert.deepEqual([s.chamados,s.despachados,s.emEspera,s.emDisputa],[3,2,1,0]);assert.equal(s.bloqueios.lock,1);assert.equal(s.viaturasDistintas,2);assert.equal(s.viaturasRepetidas,0);assert.equal(s.p50Ms,10);assert.equal(s.p95Ms,40);
 const dup=summarizeTrace(foldTrace([ev(1,'VENCEU',1,{viaturaCodigo:5}),ev(2,'VENCEU',2,{viaturaCodigo:5})]));
 assert.equal(dup.viaturasRepetidas,1);
});
