import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import pg from 'pg';
import Redis from 'ioredis';
const require=createRequire(import.meta.url);
if(process.env.NODE_ENV!=='test')throw Error('Somente testes');
const {step,patrol,shutdown}=require('../apps/gps-simulator/dist/main.js');
const pool=new pg.Pool({connectionString:process.env.VIATURAS_DATABASE_URL});const redis=new Redis(process.env.REDIS_URL);
try{
 await redis.set('sdv:sim:paused','1');await redis.set('sdv:sim:factor','1');
 const v=(await pool.query(`INSERT INTO "Viatura" (id,placa,status,latitude,longitude,capacidade,versao,"versaoPosicao","direcaoGraus","velocidadeMps","atualizadoEm") VALUES(gen_random_uuid(),'RACE'||floor(random()*100000),'OCUPADA',-12.26,-38.97,2,0,0,0,0,now()) RETURNING *`)).rows[0];
 const route=[[-12.26,-38.97],[-12.26,-38.96],[-12.25,-38.96]];
 const d=(await pool.query(`INSERT INTO "Despacho" (id,"ocorrenciaId","viaturaId",status,"criadoEm","despachadoEm",progresso,"simulacaoPausada",rota,"duracaoSegundos",versao) VALUES(gen_random_uuid(),gen_random_uuid(),$1,'EM_DESLOCAMENTO',now(),now(),0,false,$2::jsonb,100,0) RETURNING *`,[v.id,JSON.stringify(route)])).rows[0];
 // Both replicas read the same persisted frame, then contend on its CAS.
 await Promise.all([step(d,2),step(d,2)]);
 const next=(await pool.query('SELECT * FROM "Despacho" WHERE id=$1',[d.id])).rows[0];
 assert.equal(next.progresso,.02);assert.equal(next.versao,1);
 await step(d,2);assert.equal((await pool.query('SELECT progresso FROM "Despacho" WHERE id=$1',[d.id])).rows[0].progresso,.02);
 await pool.query(`UPDATE "Viatura" SET status='DISPONIVEL' WHERE id=$1`,[v.id]);
 const p=(await pool.query(`INSERT INTO "Patrulha" (id,"viaturaId",rota,progresso,versao,"duracaoSegundos","inicioEm",status) VALUES(gen_random_uuid(),$1,$2::jsonb,0,0,100,now(),'ATIVA') RETURNING *`,[v.id,JSON.stringify(route)])).rows[0];
 const snapshot={...v,status:'DISPONIVEL',patrulhaId:p.id,patrulhaVersao:p.versao,rota:route,progresso:0,duracaoSegundos:100,versaoPosicao:1};
 await Promise.all([patrol([snapshot]),patrol([snapshot])]);
 const patrolVersion=(await pool.query('SELECT "versaoPosicao" FROM "Viatura" WHERE id=$1',[v.id])).rows[0].versaoPosicao;assert.equal(patrolVersion,2);
 await patrol([snapshot]);assert.equal((await pool.query('SELECT "versaoPosicao" FROM "Viatura" WHERE id=$1',[v.id])).rows[0].versaoPosicao,2);
 await pool.query('DELETE FROM "Patrulha" WHERE id=$1',[p.id]);
 await pool.query('DELETE FROM "Despacho" WHERE id=$1',[d.id]);await pool.query('DELETE FROM "Viatura" WHERE id=$1',[v.id]);
 console.log('PASSOU: duas réplicas sobre o mesmo frame e replay não duplicam progresso nem versão no PostgreSQL');
}finally{await redis.mset('sdv:sim:paused','0','sdv:sim:factor','12');await Promise.all([shutdown(),pool.end(),redis.quit()]);}
