/** At-least-once consumer. Every state-changing effect is idempotent in the two databases. */
import Redis from 'ioredis';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { createLogger, getCorrelationId } from '@sdv/shared/logger';
import { CircuitBreaker, CircuitBreakerOpenError } from '@sdv/shared/circuit-breaker';

const logger = createLogger('dispatch-worker');
const STREAM=process.env.NODE_ENV==='test'&&process.env.SDV_TEST_STREAM?process.env.SDV_TEST_STREAM:'sdv:ocorrencias', GROUP='sdv:dispatch', CONSUMER=`worker-${randomUUID()}`;
const redis=new Redis(process.env.REDIS_URL??'redis://localhost:6379',{maxRetriesPerRequest:null});
// Blocking reads must not delay Outbox publication, ACKs or reconciliation.
const reader=redis.duplicate();
const pool=new Pool({connectionString:process.env.OCC_DATABASE_URL,max:5});
const fleetPool=new Pool({connectionString:process.env.VIATURAS_DATABASE_URL,max:3});
let running=true;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function emit(tipo:string,entidadeId:string){await redis.publish('sdv:updates',JSON.stringify({tipo,entidadeId,timestamp:new Date().toISOString()}));}

const viaturasBreaker = new CircuitBreaker({
  name: 'viaturas-service',
  failureThreshold: 3,
  cooldownMs: 5000,
  onStateChange: async (novoEstado, estadoAnterior, stats) => {
    logger.warn('Transição de estado do Circuit Breaker', {
      service: 'viaturas-service',
      estadoAnterior,
      novoEstado,
      falhas: stats.consecutiveFailures,
    });
    await redis.publish('sdv:updates', JSON.stringify({
      tipo: 'CIRCUIT_BREAKER',
      entidadeId: 'viaturas-service',
      estado: novoEstado,
      timestamp: new Date().toISOString()
    })).catch(() => undefined);
    if (novoEstado === 'CLOSED') {
      logger.info('Circuit Breaker FECHADO. Recuperação confirmada. Iniciando drenagem da fila.', { service: 'viaturas-service' });
      drainQueue().catch(e => logger.error('Falha ao drenar fila após fechamento do circuit breaker', e));
    }
  }
});

async function drainQueue(){
  const {rows}=await pool.query(`SELECT id,latitude,longitude FROM "Ocorrencia" WHERE status IN ('RECEBIDA','AGUARDANDO_VIATURA') ORDER BY prioridade DESC,"criadoEm" LIMIT 20`);
  for(const oc of rows){
    try { await dispatch(oc.id,oc.latitude,oc.longitude); }
    catch(e) {
      if (e instanceof CircuitBreakerOpenError) {
        logger.warn('Drenagem de fila suspensa: Circuit Breaker abriu novamente', { ocorrenciaId: oc.id });
        break;
      }
      logger.error('Falha ao despachar na drenagem da fila', { ocorrenciaId: oc.id, error: e });
    }
  }
}

async function publishOutbox() {
  const client=await pool.connect(); let rows:any[]=[];
  try {
    await client.query('BEGIN');
    const res=await client.query(`SELECT id,tipo,payload,"criadoEm",tentativas FROM "Outbox" WHERE "publicadoEm" IS NULL AND ("lockedUntil" IS NULL OR "lockedUntil" < now()) ORDER BY "criadoEm" LIMIT 20 FOR UPDATE SKIP LOCKED`);
    rows=res.rows;
    for(const row of rows) await client.query(`UPDATE "Outbox" SET "lockedUntil"=now()+interval '30 seconds', "tentativas"="tentativas"+1 WHERE id=$1`,[row.id]);
    await client.query('COMMIT');
  } catch(e) {await client.query('ROLLBACK');throw e;} finally{client.release();}
  for(const row of rows) {
    if (row.tentativas >= 5) {
      logger.error('Evento Outbox excedeu limite de 5 tentativas. Encaminhando para DLQ (sdv:dlq).', { outboxId: row.id, tipo: row.tipo, tentativas: row.tentativas });
      try {
        await redis.xadd('sdv:dlq', '*', 'origem', 'outbox', 'outboxId', row.id, 'tipo', row.tipo, 'payload', JSON.stringify(row.payload), 'tentativas', String(row.tentativas), 'enviadoEm', new Date().toISOString());
        await pool.query(`UPDATE "Outbox" SET "publicadoEm"=now(),"lockedUntil"=NULL WHERE id=$1`, [row.id]);
        await emit('DLQ', row.id);
      } catch(e) { logger.error('Falha ao mover outbox para DLQ', { outboxId: row.id, error: e }); }
      continue;
    }
    try {
      await redis.xadd(STREAM,'*','eventId',row.id,'tipo',row.tipo,'payload',JSON.stringify(row.payload));
      await pool.query(`UPDATE "Outbox" SET "publicadoEm"=now(),"lockedUntil"=NULL WHERE id=$1`,[row.id]);
      await emit('OCORRENCIA',String(row.payload.ocorrenciaId));
    } catch(e) {logger.error('Falha ao publicar outbox', { outboxId: row.id, error: e });}
  }
}
async function replayFleetOutbox(){
  // Reconcilia confirmações do banco de viaturas sem precisar de transação distribuída.
  const client=await fleetPool.connect();
  try {
    await client.query('BEGIN');
    // "criadoEm" é `timestamp` sem fuso, gravado em UTC. Sem o AT TIME ZONE, o driver pg o lê como hora local do
    // processo Node (ex.: UTC-3 em Bahia) e o evento sai deslocado em horas. Retorna timestamptz → instante correto.
    const {rows}=await client.query(`SELECT id,tipo,payload,"criadoEm" AT TIME ZONE 'UTC' AS "criadoEm" FROM "Outbox" WHERE "publicadoEm" IS NULL ORDER BY "criadoEm" LIMIT 20 FOR UPDATE SKIP LOCKED`);
    for(const row of rows){
      const p=row.payload;
      const labels:Record<string,string>={DESPACHO_CONFIRMADO:'Despacho confirmado',VIATURA_CHEGOU:'Viatura chegou ao local',ROTA_CALCULADA:'Rota calculada',DESLOCAMENTO_INICIADO:'Deslocamento iniciado',SINAL_PERDIDO:'Sinal de GPS perdido',SINAL_RESTABELECIDO:'Sinal de GPS restabelecido'};
      const description=row.tipo==='DESPACHO_FINALIZADO'?(p.acao==='CONCLUIDO'?'Atendimento concluído':'Ocorrência cancelada'):(labels[row.tipo]??row.tipo.replaceAll('_',' '));
      const projection=await pool.connect();
      try{
        await projection.query('BEGIN');
        await projection.query(`INSERT INTO "EventoOcorrencia" (id,"ocorrenciaId",tipo,"ocorridoEm","registradoEm","origemServico","eventIdOrigem",descricao) VALUES(gen_random_uuid(),$1,$2,$3,now(),'VIATURAS',$4,$5) ON CONFLICT ("eventIdOrigem") DO NOTHING`,[p.ocorrenciaId,row.tipo,p.chegadaEm??p.ocorridoEm??row.criadoEm,row.id,description]);
      if(row.tipo==='DESPACHO_CONFIRMADO'){
        await projection.query(`UPDATE "Ocorrencia" SET versao=versao+1,status='DESPACHADA',"viaturaId"=$2,"atualizadoEm"=now() WHERE id=$1 AND status IN ('RECEBIDA','AGUARDANDO_VIATURA')`,[p.ocorrenciaId,p.viaturaId]);
      }else if(row.tipo==='VIATURA_CHEGOU'){
        await projection.query(`UPDATE "Ocorrencia" SET versao=versao+1,status='EM_ATENDIMENTO',"atualizadoEm"=now() WHERE id=$1 AND status='DESPACHADA'`,[p.ocorrenciaId]);
      }else if(row.tipo==='DESPACHO_FINALIZADO'){
        await projection.query(`UPDATE "Ocorrencia" SET versao=versao+1,status=$2,"atualizadoEm"=now() WHERE id=$1 AND status NOT IN ('CANCELADA','ENCERRADA')`,[p.ocorrenciaId,p.acao==='CANCELADO'?'CANCELADA':'ENCERRADA']);
      }
        await projection.query('COMMIT');
      }catch(e){await projection.query('ROLLBACK');throw e;}finally{projection.release();}
      await client.query(`UPDATE "Outbox" SET "publicadoEm"=now() WHERE id=$1`,[row.id]);
      await emit('VIATURA',String(p.viaturaId||p.ocorrenciaId));
      await emit('OCORRENCIA',String(p.ocorrenciaId));
    }
    await client.query('COMMIT');
  }catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
}
async function fleetAction(path:string,body:unknown){
  return viaturasBreaker.execute(async () => {
    const correlationId=getCorrelationId()||randomUUID();
    const response=await fetch(`${process.env.VIATURAS_INTERNAL_URL?.replace(/\/dispatch$/,'')??'http://localhost:4002/internal'}${path}`,{
      method:'POST',headers:{'content-type':'application/json','x-internal-token':process.env.INTERNAL_SERVICE_TOKEN??'','x-correlation-id':correlationId},
      body:JSON.stringify(body),signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw Error(`Viaturas ${path} HTTP ${response.status}`);
    return response.json() as Promise<{status:string;viaturaId?:string}>;
  });
}
function decode(fields:string[]){const obj:Record<string,string>={};for(let i=0;i<fields.length;i+=2)obj[fields[i]]=fields[i+1];return obj;}
async function close(ocorrenciaId:string,acao:'CANCELADO'|'CONCLUIDO'){
  await fleetAction('/finish',{ocorrenciaId,acao});
  await pool.query(`UPDATE "Ocorrencia" SET versao=versao+1,status=$2,"atualizadoEm"=now() WHERE id=$1 AND status IN ('CANCELAMENTO_PENDENTE','ENCERRAMENTO_PENDENTE')`,[ocorrenciaId,acao==='CANCELADO'?'CANCELADA':'ENCERRADA']);
  await emit('OCORRENCIA',ocorrenciaId);
}
async function dispatch(ocorrenciaId:string,latitude:number,longitude:number){
  const {rows}=await pool.query(`SELECT status FROM "Ocorrencia" WHERE id=$1`,[ocorrenciaId]);
  if(!rows.length)throw Error('Ocorrência desconhecida');
  const status=rows[0].status as string;
  if(['ENCERRADA','CANCELADA','ENCERRAMENTO_PENDENTE','CANCELAMENTO_PENDENTE','EM_ATENDIMENTO'].includes(status))return;
  const result=await fleetAction('/dispatch',{ocorrenciaId,latitude,longitude});
  if(process.env.NODE_ENV==='test'&&process.env.SDV_TEST_CRASH==='AFTER_FLEET_COMMIT'&&result.status==='DESPACHADA')process.exit(86);
  if(result.status==='DESPACHADA' && result.viaturaId){
    const updated=await pool.query(`UPDATE "Ocorrencia" SET versao=versao+1,status='DESPACHADA',"viaturaId"=$2,"atualizadoEm"=now() WHERE id=$1 AND status IN ('RECEBIDA','AGUARDANDO_VIATURA') RETURNING id`,[ocorrenciaId,result.viaturaId]);
    if(!updated.rowCount){
      const latest=await pool.query(`SELECT status FROM "Ocorrencia" WHERE id=$1`,[ocorrenciaId]);
      if(['CANCELADA','CANCELAMENTO_PENDENTE','ENCERRADA','ENCERRAMENTO_PENDENTE'].includes(latest.rows[0]?.status)){
        await fleetAction('/finish',{ocorrenciaId,acao:latest.rows[0].status.startsWith('CANCEL')?'CANCELADO':'CONCLUIDO'});
      }
    }
  } else if(result.status==='SEM_VIATURA'){
    await pool.query(`UPDATE "Ocorrencia" SET versao=versao+1,status='AGUARDANDO_VIATURA',"atualizadoEm"=now() WHERE id=$1 AND status='RECEBIDA'`,[ocorrenciaId]);
  }else if(result.status!=='CANCELADO')throw Error('Resposta interna inesperada');
  await emit('OCORRENCIA',ocorrenciaId);
}
async function processMessage(messageId:string,fields:string[]) {
  const event=decode(fields);
  let p: any;
  try {
    p = JSON.parse(event.payload);
  } catch(err) {
    logger.error('Payload corrompido no stream. Encaminhando para sdv:dlq.', { messageId, error: err });
    await redis.xadd('sdv:dlq', '*', 'originalStream', STREAM, 'originalMessageId', messageId, 'tipo', event.tipo || 'DESCONHECIDO', 'payload', String(event.payload), 'erro', 'JSON inválido', 'enviadoEm', new Date().toISOString());
    await redis.xack(STREAM, GROUP, messageId);
    await emit('DLQ', messageId);
    return;
  }

  const correlationId=p?.correlationId||p?.clientRequestId||randomUUID();
  await logger.withContext({correlationId,messageId,eventTipo:event.tipo},async()=>{
    try {
      logger.info('Iniciando processamento de evento do stream',{messageId,tipo:event.tipo,ocorrenciaId:p.ocorrenciaId});
      if(event.tipo==='OCORRENCIA_RECEBIDA')await dispatch(p.ocorrenciaId,p.latitude,p.longitude);
      else if(event.tipo==='OCORRENCIA_FECHAR')await close(p.ocorrenciaId,p.acao);
      if(process.env.NODE_ENV==='test'&&process.env.SDV_TEST_CRASH==='BEFORE_ACK')process.exit(87);
      await redis.xack(STREAM,GROUP,messageId);
      await redis.hdel('sdv:msg:attempts', messageId).catch(()=>undefined);
      logger.info('Evento processado e confirmado com sucesso (XACK)',{messageId,tipo:event.tipo,ocorrenciaId:p.ocorrenciaId});
    } catch(err: any) {
      if (err instanceof CircuitBreakerOpenError) {
        logger.warn('Processamento adiado: Circuit Breaker ABERTO para viaturas-service', { messageId, erro: err.message });
        throw err;
      }
      const attempts = await redis.hincrby('sdv:msg:attempts', messageId, 1);
      await redis.expire('sdv:msg:attempts', 86400).catch(()=>undefined);

      if (attempts >= 3) {
        logger.error('Mensagem atingiu 3 falhas consecutivas. Movendo para sdv:dlq.', { messageId, tipo: event.tipo, tentativas: attempts, error: err });
        await redis.xadd('sdv:dlq', '*', 'originalStream', STREAM, 'originalMessageId', messageId, 'tipo', event.tipo, 'payload', JSON.stringify(p), 'tentativas', String(attempts), 'erro', String(err?.message || err), 'enviadoEm', new Date().toISOString());
        await redis.xack(STREAM, GROUP, messageId);
        await redis.hdel('sdv:msg:attempts', messageId).catch(()=>undefined);
        await emit('DLQ', messageId);
      } else {
        logger.warn('Falha no processamento da mensagem, aguardando retentativa', { messageId, tipo: event.tipo, tentativa: attempts, error: err });
        throw err;
      }
    }
  });
}
async function retryWaiting(){
  if (viaturasBreaker.getState() === 'OPEN') {
    logger.debug('retryWaiting suspenso: Circuit Breaker está ABERTO');
    return;
  }
  const pending=await pool.query(`SELECT id,status FROM "Ocorrencia" WHERE status IN ('CANCELAMENTO_PENDENTE','ENCERRAMENTO_PENDENTE') ORDER BY "criadoEm" LIMIT 15`);
  for(const oc of pending.rows){
    try{await close(oc.id,oc.status==='CANCELAMENTO_PENDENTE'?'CANCELADO':'CONCLUIDO');}
    catch(e){
      if(e instanceof CircuitBreakerOpenError) return;
      logger.error('Retry fechamento',{ocorrenciaId:oc.id,error:e});
    }
  }
  const {rows}=await pool.query(`SELECT id,latitude,longitude FROM "Ocorrencia" WHERE status IN ('RECEBIDA','AGUARDANDO_VIATURA') ORDER BY prioridade DESC,"criadoEm" LIMIT 15`);
  for(const oc of rows){
    try{await dispatch(oc.id,oc.latitude,oc.longitude);}
    catch(e){
      if(e instanceof CircuitBreakerOpenError) return;
      logger.error('Retry fila',{ocorrenciaId:oc.id,error:e});
    }
  }
}
async function consume(){
  try {await redis.xgroup('CREATE',STREAM,GROUP,'0','MKSTREAM');}catch(e:any){if(!String(e.message).includes('BUSYGROUP')) throw e;}
  let recovery=0,retry=0;
  while(running) {
    try {
      if(Date.now()-recovery>10000) {
        recovery=Date.now();
        const claimed=await redis.xautoclaim(STREAM,GROUP,CONSUMER,process.env.NODE_ENV==='test'&&process.env.SDV_TEST_STREAM?20:30000,'0-0','COUNT',10) as any;
        for(const [id,fields] of claimed?.[1]??[]) {try{await processMessage(id,fields);}catch(e){logger.error('Retomada',{messageId:id,error:e});}}
      }
      if(Date.now()-retry>15000&&!(process.env.NODE_ENV==='test'&&process.env.SDV_TEST_STREAM)){retry=Date.now();await retryWaiting();}
      const response=await reader.xreadgroup('GROUP',GROUP,CONSUMER,'COUNT',10,'BLOCK',2000,'STREAMS',STREAM,'>') as any;
      for(const [,messages] of response??[])for(const [id,fields] of messages){try{await processMessage(id,fields);}catch(e){logger.error('Processamento',{messageId:id,error:e});}}
    }catch(e){logger.error('Consumer offline',e);await sleep(1500);}
  }
}
async function main(){
  process.once('SIGTERM',()=>running=false);process.once('SIGINT',()=>running=false);
  const publisher=(async()=>{while(running){try{await publishOutbox();if(!(process.env.NODE_ENV==='test'&&process.env.SDV_TEST_CRASH))await replayFleetOutbox();}catch(e){logger.error('Outbox',e);}await sleep(1400);}})();
  await consume();await publisher;await Promise.all([redis.quit(),reader.quit(),pool.end(),fleetPool.end()]);
}
main().catch(e=>{logger.error('Falha fatal no worker',e);process.exitCode=1;});
