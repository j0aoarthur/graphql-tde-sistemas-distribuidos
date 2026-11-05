/** GPS fictício: usa geometria de ruas OSRM, nunca uma linha reta inventada como rota. */
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import Redis from 'ioredis';
const pool=new Pool({connectionString:process.env.VIATURAS_DATABASE_URL,max:4});
const redis=new Redis(process.env.REDIS_URL??'redis://localhost:6379');
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let running=true;
type Pos=[number,number]; // latitude, longitude
import {haversineKm} from '@sdv/shared';
import { alongRoute } from '@sdv/shared/route';
const routeCache=new Map<string,{expires:number;data:{rota:Pos[];distanciaMetros:number;duracaoSegundos:number}}>();
export async function requestRoute(start:Pos,end:Pos){
  const key=[...start,...end].map(x=>x.toFixed(5)).join(',');const cached=routeCache.get(key);if(cached&&cached.expires>Date.now())return cached.data;
  const base=(process.env.OSRM_URL??'http://localhost:5000').replace(/\/$/,'');
  const url=`${base}/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=false`;
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`OSRM HTTP ${response.status}`);
  const data=await response.json() as any;
  const chosen=data.routes?.[0];
  if(data.code!=='Ok'||!chosen?.geometry?.coordinates?.length||!Number.isFinite(chosen.duration)||chosen.duration<=0)throw Error('OSRM sem rota viária');
  const rota:Pos[]=chosen.geometry.coordinates.map((x:number[])=>[x[1],x[0]]);
  const distance=(a:Pos,b:Pos)=>haversineKm({latitude:a[0],longitude:a[1]},{latitude:b[0],longitude:b[1]});
  if(rota.some(p=>!Number.isFinite(p[0])||!Number.isFinite(p[1])||p[0]<-12.5||p[0]>-12||p[1]<-39.2||p[1]>-38.7)||distance(rota[0],start)>.15||distance(rota[rota.length-1],end)>.15||chosen.distance>50000||chosen.distance/chosen.duration>35)throw Error('Rota fora da área ou com snap/velocidade inválidos');
  const result={rota,distanciaMetros:chosen.distance as number,duracaoSegundos:chosen.duration as number};
  if(routeCache.size>=200)routeCache.delete(routeCache.keys().next().value!);routeCache.set(key,{expires:Date.now()+300000,data:result});return result;
}
async function ensureRoute(row:any){
  if(row.rota)return;
  try {
    const factor=Number(await redis.get('sdv:sim:factor')??12);
    const {rota,distanciaMetros,duracaoSegundos}=await requestRoute([row.latitude,row.longitude],[row.destinoLat,row.destinoLon]);
    await pool.query(`WITH updated AS (UPDATE "Despacho" SET versao=versao+1,rota=$2::jsonb,"distanciaMetros"=$3,"duracaoSegundos"=$4,"etaOriginalSegundos"=$4,"etaAtualSegundos"=$4,"fatorSimulacaoAplicado"=$5,"versaoPrevisao"=1,"previsaoAtualizadaEm"=now(),"previsaoChegadaEm"=now()+($4::double precision/$5::double precision)*interval '1 second',"distanciaInicialMetros"=$3,"previsaoGeradaEm"=now(),"saidaEm"=now(),"rotaErro"=NULL,status='EM_DESLOCAMENTO' WHERE id=$1 AND rota IS NULL AND status='CONFIRMADO' RETURNING *) INSERT INTO "Outbox" (id,tipo,payload,"criadoEm") SELECT gen_random_uuid(),kinds.tipo,jsonb_build_object('ocorrenciaId',"ocorrenciaId",'viaturaId',"viaturaId",'despachoId',id,'ocorridoEm',"saidaEm",'versao',versao),now() FROM updated CROSS JOIN unnest(ARRAY['ROTA_CALCULADA','DESLOCAMENTO_INICIADO']) AS kinds(tipo)`,[row.id,JSON.stringify(rota),distanciaMetros,duracaoSegundos,factor]);
    await redis.publish('sdv:updates',JSON.stringify({tipo:'ROTA',entidadeId:row.ocorrenciaId,timestamp:new Date().toISOString()}));
  }catch(e){
    await pool.query(`UPDATE "Despacho" SET "rotaErro"=$2 WHERE id=$1 AND rota IS NULL`,[row.id,String(e).slice(0,240)]);
    console.error('Falha ao calcular rota',row.id,String(e));
  }
}
export async function step(row:any,elapsed:number){
  if(!row.rota||row.simulacaoPausada)return;
  if(row.ultimaPosicaoEm)elapsed=Math.max(0,Math.min(2,(Date.now()-new Date(row.ultimaPosicaoEm).getTime())/1000));
  const points=row.rota as Pos[];
  const factor=Number(await redis.get('sdv:sim:factor')??process.env.SIMULATION_SPEED_FACTOR??'12');
  const estimated=row.duracaoSegundos > 0 ? row.duracaoSegundos : row.distanciaMetros/11;
  const newProgress=Math.min(1,Number(row.progresso)+elapsed*Math.max(1,factor)/Math.max(1,estimated));
  if(newProgress<=Number(row.progresso))return;
  const [latitude,longitude]=alongRoute(points,newProgress);
  const look=alongRoute(points,newProgress===1?Math.max(0,newProgress-.001):Math.min(1,newProgress+.001));
  const direction=(Math.atan2((newProgress===1?longitude-look[1]:look[1]-longitude)*Math.cos(latitude*Math.PI/180),newProgress===1?latitude-look[0]:look[0]-latitude)*180/Math.PI+360)%360;
  const client=await pool.connect();let didUpdate=false;
  try{
    await client.query('BEGIN');
    // CAS: duas réplicas do simulador nunca avançam o mesmo frame simultaneamente.
    const updated=await client.query(`UPDATE "Despacho" SET versao=versao+1,progresso=$3,status=$4,"etaAtualSegundos"=(1-$3::double precision)*"duracaoSegundos","previsaoAtualizadaEm"=now(),"fatorSimulacaoAplicado"=$5,"versaoPrevisao"="versaoPrevisao"+1,"previsaoChegadaEm"=now()+((1-$3::double precision)*"duracaoSegundos"/$5::double precision)*interval '1 second',"chegadaEm"=CASE WHEN $3::double precision=1 THEN COALESCE("chegadaEm",now()) ELSE "chegadaEm" END WHERE id=$1 AND progresso=$2 AND status IN ('CONFIRMADO','EM_DESLOCAMENTO') AND "simulacaoPausada"=false RETURNING id,"chegadaEm",versao`,[row.id,row.progresso,newProgress,newProgress===1?'NO_LOCAL':'EM_DESLOCAMENTO',factor]);
    if(!updated.rowCount){await client.query('ROLLBACK');return;}
    await client.query(`UPDATE "Viatura" SET latitude=$2,longitude=$3,status=$4,versao=versao+1,"versaoPosicao"="versaoPosicao"+1,"ultimoSinalEm"=now(),"ultimaPosicaoEm"=now(),"ultimoMovimentoEm"=CASE WHEN latitude<>$2 OR longitude<>$3 THEN now() ELSE "ultimoMovimentoEm" END,"direcaoGraus"=$5,"velocidadeMps"=$6,"atualizadoEm"=now() WHERE id=$1 AND status='OCUPADA'`,[row.viaturaId,latitude,longitude,newProgress===1?'NO_LOCAL':'OCUPADA',direction,newProgress===1?0:Number(row.distanciaMetros??0)/Math.max(1,estimated)]);
    if(newProgress===1){await client.query(`INSERT INTO "Outbox" (id,tipo,payload,"criadoEm") VALUES(gen_random_uuid(),'VIATURA_CHEGOU',$1::jsonb,now())`,[JSON.stringify({eventId:randomUUID(),despachoId:row.id,ocorrenciaId:row.ocorrenciaId,viaturaId:row.viaturaId,chegadaEm:updated.rows[0].chegadaEm,versao:updated.rows[0].versao})]);}
    await client.query('COMMIT');didUpdate=true;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  if(didUpdate)await redis.publish('sdv:updates',JSON.stringify({tipo:newProgress===1?'CHEGADA':'POSICAO',entidadeId:row.viaturaId,timestamp:new Date().toISOString()}));
}
// Approved urban endpoints. OSRM supplies street geometry; failure freezes movement.
const patrolTargets:Pos[]=[[-12.2577,-38.9594],[-12.2692,-38.9760],[-12.2455,-38.9576],[-12.2730,-38.9600]];
export async function patrol(snapshots?:any[]){
 const {rows}=snapshots?{rows:snapshots}:await pool.query(`SELECT v.*,p.id AS "patrulhaId",p.rota,p.progresso,p.versao AS "patrulhaVersao",p."duracaoSegundos" FROM "Viatura" v LEFT JOIN "Patrulha" p ON p."viaturaId"=v.id WHERE v.status='DISPONIVEL' AND EXISTS(SELECT 1 FROM "TurnoViatura" t WHERE t."viaturaId"=v.id AND t."fimEm" IS NULL)`);
 for(const row of rows){try{
  if(!row.patrulhaId){await pool.query(`INSERT INTO "Patrulha" (id,"viaturaId","inicioEm",status,progresso,versao) VALUES(gen_random_uuid(),$1,now(),'ATIVA',0,0) ON CONFLICT ("viaturaId") DO NOTHING`,[row.id]);continue;}
  if(!row.rota){
   const targets=patrolTargets.filter(p=>Math.hypot(p[0]-row.latitude,p[1]-row.longitude)>.001);
   const dest=targets[(row.versaoPosicao+row.id.charCodeAt(0))%targets.length];
   const route=await requestRoute([row.latitude,row.longitude],dest);
   // Installation is CAS and gated by availability. It never changes position.
   await pool.query(`UPDATE "Patrulha" SET rota=$3::jsonb,"duracaoSegundos"=$4,progresso=0,status='ATIVA',versao=versao+1,"inicioEm"=now(),"fimEm"=NULL WHERE id=$1 AND versao=$2 AND EXISTS(SELECT 1 FROM "Viatura" WHERE id=$5 AND status='DISPONIVEL' AND "versaoPosicao"=$6)`,[row.patrulhaId,row.patrulhaVersao,JSON.stringify(route.rota),route.duracaoSegundos,row.id,row.versaoPosicao]);
   continue;
  }
  const factor=Number(await redis.get('sdv:sim:factor')??12);
  const elapsed=row.ultimaPosicaoEm?Math.max(0,Math.min(2,(Date.now()-new Date(row.ultimaPosicaoEm).getTime())/1000)):1.8;
  const progress=Math.min(1,row.progresso+elapsed*factor/Math.max(1,row.duracaoSegundos));
  if(progress<=row.progresso)continue;
  const point=alongRoute(row.rota,progress);
  const nextPoint=alongRoute(row.rota,Math.min(1,progress+.001));
  const heading=(Math.atan2((nextPoint[1]-point[1])*Math.cos(point[0]*Math.PI/180),nextPoint[0]-point[0])*180/Math.PI+360)%360;
  const client=await pool.connect();try{
   await client.query('BEGIN');
   const moved=await client.query(`UPDATE "Viatura" SET latitude=$3,longitude=$4,"versaoPosicao"="versaoPosicao"+1,versao=versao+1,"direcaoGraus"=$5,"ultimoSinalEm"=now(),"ultimaPosicaoEm"=now(),"ultimoMovimentoEm"=CASE WHEN latitude<>$3 OR longitude<>$4 THEN now() ELSE "ultimoMovimentoEm" END,"atualizadoEm"=now() WHERE id=$1 AND "versaoPosicao"=$2 AND status='DISPONIVEL' RETURNING id`,[row.id,row.versaoPosicao,point[0],point[1],heading]);
   if(!moved.rowCount){await client.query('ROLLBACK');continue;}
   const advanced=await client.query(`UPDATE "Patrulha" SET progresso=$3,versao=versao+1,rota=CASE WHEN $3::double precision=1 THEN NULL ELSE rota END,"fimEm"=CASE WHEN $3::double precision=1 THEN now() ELSE NULL END WHERE id=$1 AND versao=$2 AND status='ATIVA' RETURNING id`,[row.patrulhaId,row.patrulhaVersao,progress]);
   if(!advanced.rowCount){await client.query('ROLLBACK');continue;}
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  await redis.publish('sdv:updates',JSON.stringify({tipo:'POSICAO',entidadeId:row.id,timestamp:new Date().toISOString()}));
 }catch(e){console.error('Patrulha indisponível',row.id,String(e));}}
}
export async function shutdown(){await pool.end();redis.disconnect();}
async function detectSignal(){
 await pool.query(`WITH changed AS (UPDATE "Viatura" SET "estadoSinal"=CASE WHEN "ultimoSinalEm">now()-interval '10 seconds' THEN 'OK' WHEN "ultimoSinalEm">now()-interval '30 seconds' THEN 'ATRASADO' ELSE 'SEM_SINAL' END WHERE "estadoSinal" IS DISTINCT FROM CASE WHEN "ultimoSinalEm">now()-interval '10 seconds' THEN 'OK' WHEN "ultimoSinalEm">now()-interval '30 seconds' THEN 'ATRASADO' ELSE 'SEM_SINAL' END RETURNING *) INSERT INTO "Outbox" (id,tipo,payload,"criadoEm") SELECT gen_random_uuid(),CASE WHEN c."estadoSinal"='OK' THEN 'SINAL_RESTABELECIDO' ELSE 'SINAL_PERDIDO' END,jsonb_build_object('ocorrenciaId',d."ocorrenciaId",'viaturaId',c.id,'ocorridoEm',now(),'situacao',c."estadoSinal"),now() FROM changed c JOIN "Despacho" d ON d."viaturaId"=c.id AND d.status IN ('CONFIRMADO','EM_DESLOCAMENTO','NO_LOCAL')`);
}
async function tick(elapsed:number){
  const [paused,offline]=await redis.mget('sdv:sim:paused','sdv:sim:signal-lost');
  await detectSignal();
  if(offline==='1')return;
  await pool.query(`UPDATE "Viatura" SET "ultimoSinalEm"=now() WHERE EXISTS(SELECT 1 FROM "TurnoViatura" t WHERE t."viaturaId"="Viatura".id AND t."fimEm" IS NULL)`);
  if(paused==='1')return;
  await patrol();
  const {rows}=await pool.query(`SELECT d.*,v.latitude,v.longitude,v."ultimaPosicaoEm" FROM "Despacho" d JOIN "Viatura" v ON v.id=d."viaturaId" WHERE d.status IN ('CONFIRMADO','EM_DESLOCAMENTO') ORDER BY d."criadoEm" LIMIT 100`);
  for(const row of rows){try{if(!row.rota)await ensureRoute(row);else await step(row,elapsed);}catch(e){console.error('Tick',row.id,e);}}
}
async function main(){
  process.once('SIGTERM',()=>running=false);process.once('SIGINT',()=>running=false);
  let last=Date.now();
  while(running){const now=Date.now(),delta=Math.min(5,(now-last)/1000);last=now;try{await tick(delta);}catch(e){console.error('Simulador offline',e);}await sleep(1800);}
  await pool.end();redis.disconnect();
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
