/** GPS fictício: usa geometria de ruas OSRM, nunca uma linha reta inventada como rota. */
import { Pool } from 'pg';
import Redis from 'ioredis';
const pool=new Pool({connectionString:process.env.VIATURAS_DATABASE_URL,max:4});
const redis=new Redis(process.env.REDIS_URL??'redis://localhost:6379');
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let running=true;
type Pos=[number,number]; // latitude, longitude
import { alongRoute } from '@sdv/shared/route';
async function requestRoute(start:Pos,end:Pos){
  const base=(process.env.OSRM_URL??'http://localhost:5000').replace(/\/$/,'');
  const url=`${base}/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=false`;
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`OSRM HTTP ${response.status}`);
  const data=await response.json() as any;
  const chosen=data.routes?.[0];
  if(data.code!=='Ok'||!chosen?.geometry?.coordinates?.length)throw Error('OSRM sem rota viária');
  const rota:Pos[]=chosen.geometry.coordinates.map((x:number[])=>[x[1],x[0]]);
  return {rota,distanciaMetros:chosen.distance as number,duracaoSegundos:chosen.duration as number};
}
async function ensureRoute(row:any){
  if(row.rota)return;
  try {
    const {rota,distanciaMetros,duracaoSegundos}=await requestRoute([row.latitude,row.longitude],[row.destinoLat,row.destinoLon]);
    await pool.query(`UPDATE "Despacho" SET rota=$2::jsonb,"distanciaMetros"=$3,"duracaoSegundos"=$4,"rotaErro"=NULL,status='EM_DESLOCAMENTO' WHERE id=$1 AND rota IS NULL AND status='CONFIRMADO'`,[row.id,JSON.stringify(rota),distanciaMetros,duracaoSegundos]);
    await redis.publish('sdv:updates',JSON.stringify({tipo:'ROTA',entidadeId:row.ocorrenciaId,timestamp:new Date().toISOString()}));
  }catch(e){
    await pool.query(`UPDATE "Despacho" SET "rotaErro"=$2 WHERE id=$1 AND rota IS NULL`,[row.id,String(e).slice(0,240)]);
    console.error('Falha ao calcular rota',row.id,String(e));
  }
}
async function step(row:any,elapsed:number){
  if(!row.rota||row.simulacaoPausada)return;
  const points=row.rota as Pos[];
  const factor=Number(await redis.get('sdv:sim:factor')??process.env.SIMULATION_SPEED_FACTOR??'12');
  const estimated=row.duracaoSegundos > 0 ? row.duracaoSegundos : row.distanciaMetros/11;
  const newProgress=Math.min(1,Number(row.progresso)+elapsed*Math.max(1,factor)/Math.max(1,estimated));
  const [latitude,longitude]=alongRoute(points,newProgress);
  const client=await pool.connect();let didUpdate=false;
  try{
    await client.query('BEGIN');
    // CAS: duas réplicas do simulador nunca avançam o mesmo frame simultaneamente.
    const updated=await client.query(`UPDATE "Despacho" SET progresso=$3,status=$4 WHERE id=$1 AND progresso=$2 AND status IN ('CONFIRMADO','EM_DESLOCAMENTO') AND "simulacaoPausada"=false RETURNING id`,[row.id,row.progresso,newProgress,newProgress===1?'NO_LOCAL':'EM_DESLOCAMENTO']);
    if(!updated.rowCount){await client.query('ROLLBACK');return;}
    await client.query(`UPDATE "Viatura" SET latitude=$2,longitude=$3,status=$4,versao=versao+1,"atualizadoEm"=now() WHERE id=$1 AND status='OCUPADA'`,[row.viaturaId,latitude,longitude,newProgress===1?'NO_LOCAL':'OCUPADA']);
    if(newProgress===1){await client.query(`INSERT INTO "Outbox" (id,tipo,payload,"criadoEm") VALUES(gen_random_uuid(),'VIATURA_CHEGOU',$1::jsonb,now())`,[JSON.stringify({ocorrenciaId:row.ocorrenciaId,viaturaId:row.viaturaId})]);}
    await client.query('COMMIT');didUpdate=true;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  if(didUpdate)await redis.publish('sdv:updates',JSON.stringify({tipo:newProgress===1?'CHEGADA':'POSICAO',entidadeId:row.viaturaId,timestamp:new Date().toISOString()}));
}
async function tick(elapsed:number){
  const [paused,offline]=await redis.mget('sdv:sim:paused','sdv:sim:signal-lost');
  if(paused==='1'||offline==='1')return;
  const {rows}=await pool.query(`SELECT d.*,v.latitude,v.longitude FROM "Despacho" d JOIN "Viatura" v ON v.id=d."viaturaId" WHERE d.status IN ('CONFIRMADO','EM_DESLOCAMENTO') ORDER BY d."criadoEm" LIMIT 100`);
  for(const row of rows){try{if(!row.rota)await ensureRoute(row);else await step(row,elapsed);}catch(e){console.error('Tick',row.id,e);}}
}
async function main(){
  process.once('SIGTERM',()=>running=false);process.once('SIGINT',()=>running=false);
  let last=Date.now();
  while(running){const now=Date.now(),delta=Math.min(5,(now-last)/1000);last=now;try{await tick(delta);}catch(e){console.error('Simulador offline',e);}await sleep(1800);}
  await pool.end();redis.disconnect();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
