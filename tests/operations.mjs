import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import Redis from 'ioredis';
if(process.env.NODE_ENV!=='test'||!process.env.OCC_DATABASE_URL?.includes('127.0.0.1'))throw Error('Exige bancos locais isolados de teste');
const fleet=new pg.Pool({connectionString:process.env.VIATURAS_DATABASE_URL});
const occ=new pg.Pool({connectionString:process.env.OCC_DATABASE_URL});
const redis=new Redis(process.env.REDIS_URL);
const api='http://127.0.0.1:4000/graphql';
async function query(query,variables={},token=''){const r=await fetch(api,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({query,variables})});const data=await r.json();if(data.errors)throw Error(JSON.stringify(data.errors));return data.data;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<80;n++){const result=await fn();if(result)return result;await delay(250);}throw Error('Timeout de integração');}
async function login(email){return (await query('mutation($e:String!,$s:String!){login(email:$e,senha:$s){accessToken}}',{e:email,s:process.env.DEMO_ADMIN_PASSWORD})).login.accessToken;}
try{
 const a=await login('central-a@sdv.local'),b=await login('central-b@sdv.local');
 await redis.mset('sdv:sim:factor','1','sdv:sim:paused','0');
 await until(async()=>Number((await fleet.query('SELECT count(*) FROM "Viatura" WHERE status=\'DISPONIVEL\' AND "versaoPosicao"=0')).rows[0].count)===0);
 const before=await fleet.query('SELECT count(*) FROM "Despacho"');
 const prediction=(await query('query{preverDespacho(latitude:-12.26,longitude:-38.97){qualidadeEstimativa viaturaCandidataId duracaoViariaSegundos}}',{},a)).preverDespacho;
 assert.equal(prediction.qualidadeEstimativa,'ROTEAVEL');assert.ok(prediction.duracaoViariaSegundos>0);
 assert.equal((await fleet.query('SELECT count(*) FROM "Despacho"')).rows[0].count,before.rows[0].count,'preview não reserva');
 const input={tipo:'Teste ciclo v3',descricao:'Descrição persistida do teste',enderecoFormatado:'Rua de teste em Feira de Santana',referencia:'Ponto confirmado',origemLocalizacao:'PIN',precisaoLocalizacao:'PONTO',localConfirmado:true,prioridade:4,latitude:-12.26,longitude:-38.97,clientRequestId:randomUUID()};
 const create='mutation($i:AbrirOcorrenciaInput!){abrirOcorrencia(input:$i){id descricao enderecoFormatado latitude longitude eventos{autor}}}';
 await assert.rejects(query(create,{i:{...input,localConfirmado:false}},a));
 const created=(await query(create,{i:input},a)).abrirOcorrencia;
 assert.ok(created.eventos.some(e=>e.autor.includes('ADMIN')));
 assert.equal(created.descricao,input.descricao);assert.equal(created.latitude,input.latitude);
 const duplicate=(await query(create,{i:input},a)).abrirOcorrencia;assert.equal(duplicate.id,created.id);
 await assert.rejects(query(create,{i:{...input,descricao:'Outro conteúdo'}},a));
 const initial=await until(async()=>{const r=await fleet.query('SELECT * FROM "Despacho" WHERE "ocorrenciaId"=$1',[created.id]);return r.rows[0]?.etaOriginalSegundos?r.rows[0]:null;});
 assert.ok(initial.etaOriginalSegundos>0);
 await query('mutation{configurarSimulacao(fator:60,pausada:true){fator}}',{},a);
 const pausedForecast=(await fleet.query('SELECT * FROM "Despacho" WHERE id=$1',[initial.id])).rows[0];assert.equal(pausedForecast.previsaoChegadaEm,null);assert.equal(pausedForecast.etaOriginalSegundos,initial.etaOriginalSegundos);
 await query('mutation{configurarSimulacao(fator:60,pausada:false){fator}}',{},a);
 const arrival=await until(async()=>{const r=await fleet.query('SELECT * FROM "Despacho" WHERE "ocorrenciaId"=$1',[created.id]);return r.rows[0]?.chegadaEm?r.rows[0]:null;});
 assert.equal(arrival.etaOriginalSegundos,initial.etaOriginalSegundos);assert.equal(arrival.etaAtualSegundos,0);
 assert.equal((await fleet.query('SELECT status FROM "Patrulha" WHERE "viaturaId"=$1',[arrival.viaturaId])).rows[0].status,'SUSPENSA');
 assert.equal(arrival.status,'NO_LOCAL');assert.equal(arrival.progresso,1);assert.ok(arrival.etaOriginalSegundos>0);
 await until(async()=>{const r=await occ.query('SELECT * FROM "EventoOcorrencia" WHERE "ocorrenciaId"=$1 AND tipo=\'VIATURA_CHEGOU\'',[created.id]);return r.rows[0];});
 const event=(await occ.query('SELECT * FROM "EventoOcorrencia" WHERE "ocorrenciaId"=$1 AND tipo=\'VIATURA_CHEGOU\'',[created.id])).rows[0];
 assert.equal(event.ocorridoEm.toISOString(),arrival.chegadaEm.toISOString());
 await fleet.query('UPDATE "Outbox" SET "publicadoEm"=NULL WHERE tipo=\'VIATURA_CHEGOU\' AND payload->>\'ocorrenciaId\'=$1',[created.id]);
 await delay(1800);
 assert.equal((await occ.query('SELECT count(*) FROM "EventoOcorrencia" WHERE "eventIdOrigem"=$1',[event.eventIdOrigem])).rows[0].count,'1');
 const vehicle=(await fleet.query('SELECT * FROM "Viatura" WHERE id=$1',[arrival.viaturaId])).rows[0];
 await delay(2000);const heartbeat=(await fleet.query('SELECT * FROM "Viatura" WHERE id=$1',[arrival.viaturaId])).rows[0];
 assert.ok(heartbeat.ultimoSinalEm>vehicle.ultimoSinalEm);assert.equal(heartbeat.latitude,vehicle.latitude);assert.equal(heartbeat.ultimoMovimentoEm.toISOString(),vehicle.ultimoMovimentoEm.toISOString());
 await assert.rejects(query('mutation($id:ID!){encerrarOcorrencia(id:$id){id}}',{id:created.id},b));
 await query('mutation($id:ID!){encerrarOcorrencia(id:$id){id}}',{id:created.id},a);
 await until(async()=>{const r=await fleet.query('SELECT status FROM "Viatura" WHERE id=$1',[arrival.viaturaId]);return r.rows[0]?.status==='DISPONIVEL';});
 const startPatrol=(await fleet.query('SELECT "versaoPosicao" FROM "Viatura" WHERE id=$1',[arrival.viaturaId])).rows[0].versaoPosicao;
 await until(async()=>{const r=await fleet.query('SELECT * FROM "Viatura" WHERE id=$1',[arrival.viaturaId]);return r.rows[0]?.versaoPosicao>startPatrol;});
 const stats=(await query('query($id:ID!){estatisticasViatura(id:$id){despachosIniciadosHoje atendimentosConcluidosHoje canceladosHoje operandoDesde situacaoSinal}}',{id:arrival.viaturaId},a)).estatisticasViatura;
 assert.ok(stats.atendimentosConcluidosHoje>=1);assert.ok(stats.operandoDesde);assert.equal(stats.situacaoSinal,'OK');
 const duplicates=await fleet.query(`SELECT "viaturaId" FROM "Despacho" WHERE status NOT IN ('CONCLUIDO','CANCELADO') GROUP BY "viaturaId" HAVING count(*)>1`);assert.equal(duplicates.rowCount,0);
 console.log('PASSOU: prévia OSRM Table sem reserva, validação/metadata, idempotência, ETA real alocado, chegada canônica, replay auditável, heartbeat parado, autorização, encerramento, retomada da patrulha e estatísticas Bahia em PostgreSQL/Redis reais; OSRM usa fixture');
}finally{await Promise.all([fleet.end(),occ.end(),redis.quit()]);}
