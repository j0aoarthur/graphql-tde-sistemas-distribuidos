import assert from 'node:assert/strict';import pg from 'pg';import Redis from 'ioredis';import {randomUUID} from 'node:crypto';
if(process.env.NODE_ENV!=='test'||!process.env.VIATURAS_DATABASE_URL?.includes('127.0.0.1'))throw Error('Somente banco local de testes');
const pool=new pg.Pool({connectionString:process.env.VIATURAS_DATABASE_URL}),redis=new Redis(process.env.REDIS_URL),delay=ms=>new Promise(r=>setTimeout(r,ms)),id=randomUUID();
const fixture=(ms)=>fetch(`http://127.0.0.1:5010/test/route-delay?ms=${ms}`).then(r=>{assert(r.ok);});
try{
 await redis.mset('sdv:sim:paused','0','sdv:sim:factor','1');await fixture(4000);
 const original=(await pool.query(`SELECT id,"versaoPosicao" FROM "Viatura" WHERE status='DISPONIVEL' AND "velocidadeMps">2 ORDER BY id LIMIT 1`)).rows[0];assert(original);
 await pool.query(`INSERT INTO "Viatura" (id,placa,status,latitude,longitude,capacidade,"atualizadoEm") VALUES($1,$2,'DISPONIVEL',-12.265123,-38.965321,2,now())`,[id,'LAT'+id.slice(0,6)]);
 await pool.query(`INSERT INTO "TurnoViatura" (id,"viaturaId","inicioEm") VALUES(gen_random_uuid(),$1,now())`,[id]);
 await delay(3300);
 const moving=(await pool.query(`SELECT "versaoPosicao","ultimoSinalEm" FROM "Viatura" WHERE id=$1`,[original.id])).rows[0];assert(moving.versaoPosicao>=original.versaoPosicao+2,'OSRM lento não interrompe GPS das outras viaturas');assert(Date.now()-moving.ultimoSinalEm.getTime()<1800);
 const pending=(await pool.query(`SELECT rota FROM "Patrulha" WHERE "viaturaId"=$1`,[id])).rows[0];assert(pending);assert.equal(pending.rota,null,'requisição de rota ainda pendente');
 await delay(4000);assert((await pool.query(`SELECT rota FROM "Patrulha" WHERE "viaturaId"=$1`,[id])).rows[0]?.rota,'rota instalada após resposta, sem alterar regra de disponibilidade');
 console.log('PASSOU: atraso OSRM de 4 s não bloqueia GPS/heartbeat da frota; rota pendente é instalada posteriormente por CAS');
}finally{await fixture(0);await pool.query('DELETE FROM "Patrulha" WHERE "viaturaId"=$1',[id]);await pool.query('DELETE FROM "TurnoViatura" WHERE "viaturaId"=$1',[id]);await pool.query('DELETE FROM "Viatura" WHERE id=$1',[id]);await Promise.all([pool.end(),redis.quit()]);}
