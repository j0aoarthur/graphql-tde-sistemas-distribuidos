import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';import {openSync,closeSync} from 'node:fs';import pg from 'pg';import Redis from 'ioredis';
if(process.env.NODE_ENV!=='test'||process.env.SDV_WORKER_CONTROL!=='1'||!process.env.OCC_DATABASE_URL?.includes('127.0.0.1'))throw Error('Exige worker principal parado e ambiente local isolado');
const pool=new pg.Pool({connectionString:process.env.OCC_DATABASE_URL}),fleet=new pg.Pool({connectionString:process.env.VIATURAS_DATABASE_URL});const redis=new Redis(process.env.REDIS_URL);
const delay=ms=>new Promise(r=>setTimeout(r,ms));let child;
async function query(query,variables={},token=''){const r=await fetch('http://127.0.0.1:4000/graphql',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({query,variables})});const b=await r.json();if(b.errors)throw Error(JSON.stringify(b.errors));return b.data;}
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await delay(200);}throw Error('Timeout na recuperação');}
function start(stream,fault=''){const fd=openSync('/tmp/sdv-recovery-worker.log','a');child=spawn(process.execPath,['apps/dispatch-worker/dist/main.js'],{env:{...process.env,SDV_TEST_STREAM:stream,SDV_TEST_CRASH:fault},stdio:['ignore',fd,fd]});closeSync(fd);return child;}
async function stop(){if(child&&child.exitCode===null){child.kill('SIGTERM');await delay(300);if(child.exitCode===null)child.kill('SIGKILL');}}
try{
 const token=(await query('mutation($s:String!){login(email:"central-a@sdv.local",senha:$s){accessToken}}',{s:process.env.DEMO_ADMIN_PASSWORD})).login.accessToken;
 for(const fault of ['AFTER_FLEET_COMMIT','BEFORE_ACK']){
  const stream=`sdv:test-recovery:${randomUUID()}`;
  const input={tipo:'Teste recuperação',descricao:'Falha controlada de teste',enderecoFormatado:'Feira de Santana',origemLocalizacao:'PIN',precisaoLocalizacao:'PONTO',localConfirmado:true,prioridade:2,latitude:-12.26,longitude:-38.97,clientRequestId:randomUUID()};
  const oc=(await query('mutation($i:AbrirOcorrenciaInput!){abrirOcorrencia(input:$i){id}}',{i:input},token)).abrirOcorrencia;
  const crashed=start(stream,fault);await until(()=>Promise.resolve(crashed.exitCode!==null));assert.equal(crashed.exitCode,fault==='BEFORE_ACK'?87:86);
  assert.equal((await fleet.query('SELECT count(*) FROM "Despacho" WHERE "ocorrenciaId"=$1',[oc.id])).rows[0].count,'1');
  const pending=await redis.xpending(stream,'sdv:dispatch');assert.ok(Number(pending[0])>=1);
  start(stream);
  await until(async()=>{const r=await pool.query('SELECT status FROM "Ocorrencia" WHERE id=$1',[oc.id]);return ['DESPACHADA','EM_ATENDIMENTO'].includes(r.rows[0]?.status);});
  await until(async()=>Number((await redis.xpending(stream,'sdv:dispatch'))[0])===0);
  assert.equal((await fleet.query('SELECT count(*) FROM "Despacho" WHERE "ocorrenciaId"=$1',[oc.id])).rows[0].count,'1');
  console.log(`PASSOU: crash ${fault}, pending recuperado e projeção convergente sem despacho duplicado`);await query('mutation($id:ID!){cancelarOcorrencia(id:$id,motivo:"Limpeza do teste de recuperação"){id}}',{id:oc.id},token);await until(async()=>{const r=await pool.query('SELECT status FROM "Ocorrencia" WHERE id=$1',[oc.id]);return r.rows[0]?.status==='CANCELADA';});await stop();await redis.del(stream);
 }
}finally{await stop();await Promise.all([pool.end(),fleet.end(),redis.quit()]);}
