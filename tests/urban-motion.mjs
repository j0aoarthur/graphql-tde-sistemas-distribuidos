import assert from 'node:assert/strict';
import pg from 'pg';import Redis from 'ioredis';
import {createRequire} from 'node:module';
const {meters}=createRequire(import.meta.url)('../packages/shared/route.cjs');
if(process.env.NODE_ENV!=='test'||!process.env.VIATURAS_DATABASE_URL?.includes('127.0.0.1'))throw Error('Banco local de testes obrigatório');
const pool=new pg.Pool({connectionString:process.env.VIATURAS_DATABASE_URL}),redis=new Redis(process.env.REDIS_URL),delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await redis.mset('sdv:sim:paused','1','sdv:sim:factor','1');await delay(1400);
 await pool.query(`UPDATE "Viatura" SET "velocidadeMps"=0 WHERE status='DISPONIVEL'`);
 const rows=()=>pool.query(`SELECT id,latitude,longitude,"velocidadeMps","ultimaPosicaoEm","versaoPosicao" FROM "Viatura" WHERE status='DISPONIVEL' ORDER BY id`).then(r=>r.rows);
 let previous=await rows();assert(previous.length>=3);const first=previous;await redis.set('sdv:sim:paused','0');
 for(let n=0;n<6;n++){
  await delay(1100);const current=await rows();
  for(const v of current){assert(v.velocidadeMps>=0&&v.velocidadeMps<=14);assert(meters([-12.26,-38.966],[v.latitude,v.longitude])<=6000);const old=previous.find(p=>p.id===v.id);if(old&&v.versaoPosicao>old.versaoPosicao){const elapsed=(new Date(v.ultimaPosicaoEm)-new Date(old.ultimaPosicaoEm))/1000;assert(meters([old.latitude,old.longitude],[v.latitude,v.longitude])<=14*Math.max(1.2,elapsed)+2,'deslocamento fisicamente limitado');}}
  previous=current;
 }
 assert(previous.every(v=>v.versaoPosicao>first.find(x=>x.id===v.id).versaoPosicao),'todas as viaturas livres patrulham');
 assert(new Set(previous.map(v=>v.velocidadeMps.toFixed(1))).size>=3,'velocidades individuais diferentes');
 console.log('PASSOU: 1×, aceleração após parada, limites físicos entre amostras, velocidades distintas e patrulha dentro de raio urbano simulado de 6 km');
}finally{await redis.set('sdv:sim:paused','0');await Promise.all([pool.end(),redis.quit()]);}
