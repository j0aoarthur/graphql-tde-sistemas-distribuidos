/** At-least-once consumer. Every state-changing effect is idempotent in the two databases. */
import Redis from 'ioredis';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
const STREAM='sdv:ocorrencias', GROUP='sdv:dispatch', CONSUMER=`worker-${randomUUID()}`;
const redis=new Redis(process.env.REDIS_URL??'redis://localhost:6379',{maxRetriesPerRequest:null});
const pool=new Pool({connectionString:process.env.OCC_DATABASE_URL,max:5});
const fleetPool=new Pool({connectionString:process.env.VIATURAS_DATABASE_URL,max:3});
let running=true;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function emit(tipo:string,entidadeId:string){await redis.publish('sdv:updates',JSON.stringify({tipo,entidadeId,timestamp:new Date().toISOString()}));}
async function publishOutbox() {
  const client=await pool.connect(); let rows:any[]=[];
  try {
    await client.query('BEGIN');
    const res=await client.query(`SELECT id,tipo,payload FROM "Outbox" WHERE "publicadoEm" IS NULL AND ("lockedUntil" IS NULL OR "lockedUntil" < now()) ORDER BY "criadoEm" LIMIT 20 FOR UPDATE SKIP LOCKED`);
    rows=res.rows;
    for(const row of rows) await client.query(`UPDATE "Outbox" SET "lockedUntil"=now()+interval '30 seconds', "tentativas"="tentativas"+1 WHERE id=$1`,[row.id]);
    await client.query('COMMIT');
  } catch(e) {await client.query('ROLLBACK');throw e;} finally{client.release();}
  for(const row of rows) {
    try {
      await redis.xadd(STREAM,'*','eventId',row.id,'tipo',row.tipo,'payload',JSON.stringify(row.payload));
      await pool.query(`UPDATE "Outbox" SET "publicadoEm"=now(),"lockedUntil"=NULL WHERE id=$1`,[row.id]);
      await emit('OCORRENCIA',String(row.payload.ocorrenciaId));
    } catch(e) {console.error('Falha ao publicar outbox',row.id,e);}
  }
}
async function replayFleetOutbox(){
  // Reconcilia confirmações do banco de viaturas sem precisar de transação distribuída.
  const client=await fleetPool.connect();
  try {
    await client.query('BEGIN');
    const {rows}=await client.query(`SELECT id,tipo,payload FROM "Outbox" WHERE "publicadoEm" IS NULL ORDER BY "criadoEm" LIMIT 20 FOR UPDATE SKIP LOCKED`);
    for(const row of rows){
      const p=row.payload;
      if(row.tipo==='DESPACHO_CONFIRMADO'){
        await pool.query(`UPDATE "Ocorrencia" SET status='DESPACHADA',"viaturaId"=$2,"atualizadoEm"=now() WHERE id=$1 AND status IN ('RECEBIDA','AGUARDANDO_VIATURA')`,[p.ocorrenciaId,p.viaturaId]);
      }else if(row.tipo==='VIATURA_CHEGOU'){
        await pool.query(`UPDATE "Ocorrencia" SET status='EM_ATENDIMENTO',"atualizadoEm"=now() WHERE id=$1 AND status='DESPACHADA'`,[p.ocorrenciaId]);
      }else if(row.tipo==='DESPACHO_FINALIZADO'){
        await pool.query(`UPDATE "Ocorrencia" SET status=$2,"atualizadoEm"=now() WHERE id=$1 AND status NOT IN ('CANCELADA','ENCERRADA')`,[p.ocorrenciaId,p.acao==='CANCELADO'?'CANCELADA':'ENCERRADA']);
      }
      await client.query(`UPDATE "Outbox" SET "publicadoEm"=now() WHERE id=$1`,[row.id]);
      await emit('VIATURA',String(p.viaturaId||p.ocorrenciaId));
      await emit('OCORRENCIA',String(p.ocorrenciaId));
    }
    await client.query('COMMIT');
  }catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
}
async function fleetAction(path:string,body:unknown){
  const response=await fetch(`${process.env.VIATURAS_INTERNAL_URL?.replace(/\/dispatch$/,'')??'http://localhost:4002/internal'}${path}`,{
    method:'POST',headers:{'content-type':'application/json','x-internal-token':process.env.INTERNAL_SERVICE_TOKEN??''},
    body:JSON.stringify(body),signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw Error(`Viaturas ${path} HTTP ${response.status}`);
  return response.json() as Promise<{status:string;viaturaId?:string}>;
}
function decode(fields:string[]){const obj:Record<string,string>={};for(let i=0;i<fields.length;i+=2)obj[fields[i]]=fields[i+1];return obj;}
async function close(ocorrenciaId:string,acao:'CANCELADO'|'CONCLUIDO'){
  await fleetAction('/finish',{ocorrenciaId,acao});
  await pool.query(`UPDATE "Ocorrencia" SET status=$2,"atualizadoEm"=now() WHERE id=$1 AND status IN ('CANCELAMENTO_PENDENTE','ENCERRAMENTO_PENDENTE')`,[ocorrenciaId,acao==='CANCELADO'?'CANCELADA':'ENCERRADA']);
  await emit('OCORRENCIA',ocorrenciaId);
}
async function dispatch(ocorrenciaId:string,latitude:number,longitude:number){
  const {rows}=await pool.query(`SELECT status FROM "Ocorrencia" WHERE id=$1`,[ocorrenciaId]);
  if(!rows.length)throw Error('Ocorrência desconhecida');
  const status=rows[0].status as string;
  if(['ENCERRADA','CANCELADA','ENCERRAMENTO_PENDENTE','CANCELAMENTO_PENDENTE','EM_ATENDIMENTO'].includes(status))return;
  const result=await fleetAction('/dispatch',{ocorrenciaId,latitude,longitude});
  if(result.status==='DESPACHADA' && result.viaturaId){
    const updated=await pool.query(`UPDATE "Ocorrencia" SET status='DESPACHADA',"viaturaId"=$2,"atualizadoEm"=now() WHERE id=$1 AND status IN ('RECEBIDA','AGUARDANDO_VIATURA') RETURNING id`,[ocorrenciaId,result.viaturaId]);
    if(!updated.rowCount){
      const latest=await pool.query(`SELECT status FROM "Ocorrencia" WHERE id=$1`,[ocorrenciaId]);
      if(['CANCELADA','CANCELAMENTO_PENDENTE','ENCERRADA','ENCERRAMENTO_PENDENTE'].includes(latest.rows[0]?.status)){
        await fleetAction('/finish',{ocorrenciaId,acao:latest.rows[0].status.startsWith('CANCEL')?'CANCELADO':'CONCLUIDO'});
      }
    }
  } else if(result.status==='SEM_VIATURA'){
    await pool.query(`UPDATE "Ocorrencia" SET status='AGUARDANDO_VIATURA',"atualizadoEm"=now() WHERE id=$1 AND status='RECEBIDA'`,[ocorrenciaId]);
  }else if(result.status!=='CANCELADO')throw Error('Resposta interna inesperada');
  await emit('OCORRENCIA',ocorrenciaId);
}
async function processMessage(messageId:string,fields:string[]) {
  const event=decode(fields), p=JSON.parse(event.payload);
  if(event.tipo==='OCORRENCIA_RECEBIDA')await dispatch(p.ocorrenciaId,p.latitude,p.longitude);
  else if(event.tipo==='OCORRENCIA_FECHAR')await close(p.ocorrenciaId,p.acao);
  await redis.xack(STREAM,GROUP,messageId);
}
async function retryWaiting(){
  const pending=await pool.query(`SELECT id,status FROM "Ocorrencia" WHERE status IN ('CANCELAMENTO_PENDENTE','ENCERRAMENTO_PENDENTE') ORDER BY "criadoEm" LIMIT 15`);
  for(const oc of pending.rows){try{await close(oc.id,oc.status==='CANCELAMENTO_PENDENTE'?'CANCELADO':'CONCLUIDO');}catch(e){console.error('Retry fechamento',oc.id,e);}}
  const {rows}=await pool.query(`SELECT id,latitude,longitude FROM "Ocorrencia" WHERE status IN ('RECEBIDA','AGUARDANDO_VIATURA') ORDER BY prioridade DESC,"criadoEm" LIMIT 15`);
  for(const oc of rows){try{await dispatch(oc.id,oc.latitude,oc.longitude);}catch(e){console.error('Retry fila',oc.id,e);}}
}
async function consume(){
  try {await redis.xgroup('CREATE',STREAM,GROUP,'0','MKSTREAM');}catch(e:any){if(!String(e.message).includes('BUSYGROUP')) throw e;}
  let recovery=0,retry=0;
  while(running) {
    try {
      if(Date.now()-recovery>10000) {
        recovery=Date.now();
        const claimed=await redis.xautoclaim(STREAM,GROUP,CONSUMER,30000,'0-0','COUNT',10) as any;
        for(const [id,fields] of claimed?.[1]??[]) {try{await processMessage(id,fields);}catch(e){console.error('Retomada',id,e);}}
      }
      if(Date.now()-retry>15000){retry=Date.now();await retryWaiting();}
      const response=await redis.xreadgroup('GROUP',GROUP,CONSUMER,'COUNT',10,'BLOCK',2000,'STREAMS',STREAM,'>') as any;
      for(const [,messages] of response??[])for(const [id,fields] of messages){try{await processMessage(id,fields);}catch(e){console.error('Processamento',id,e);}}
    }catch(e){console.error('Consumer offline:',e);await sleep(1500);}
  }
}
async function main(){
  process.once('SIGTERM',()=>running=false);process.once('SIGINT',()=>running=false);
  const publisher=(async()=>{while(running){try{await publishOutbox();await replayFleetOutbox();}catch(e){console.error('Outbox',e);}await sleep(1400);}})();
  await consume();await publisher;await Promise.all([redis.quit(),pool.end(),fleetPool.end()]);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
