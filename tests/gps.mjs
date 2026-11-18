import assert from 'node:assert/strict';import pg from 'pg';import Redis from 'ioredis';
if(process.env.NODE_ENV!=='test'||!process.env.VIATURAS_DATABASE_URL?.includes('127.0.0.1'))throw Error('Banco de teste local obrigatório');
const pool=new pg.Pool({connectionString:process.env.VIATURAS_DATABASE_URL}),redis=new Redis(process.env.REDIS_URL);const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await redis.set('sdv:sim:paused','1');await delay(2200);
 const stationary=(await pool.query(`SELECT * FROM "Viatura" ORDER BY id LIMIT 1`)).rows[0];await delay(2200);const paused=(await pool.query('SELECT * FROM "Viatura" WHERE id=$1',[stationary.id])).rows[0];assert.ok(paused.ultimoSinalEm>stationary.ultimoSinalEm);assert.equal(paused.latitude,stationary.latitude);
 await redis.set('sdv:sim:paused','0');
 await redis.set('sdv:sim:signal-lost','1','EX',15);await delay(2200);
 const row=(await pool.query(`SELECT * FROM "Viatura" WHERE status='DISPONIVEL' ORDER BY id LIMIT 1`)).rows[0];
 await pool.query(`UPDATE "Viatura" SET "ultimoSinalEm"=now()-interval '40 seconds' WHERE id=$1`,[row.id]);
 await delay(2500);const offline=(await pool.query('SELECT * FROM "Viatura" WHERE id=$1',[row.id])).rows[0];
 assert.equal(offline.latitude,row.latitude);assert.equal(offline.longitude,row.longitude);assert.equal(offline.versaoPosicao,row.versaoPosicao);assert.equal(offline.estadoSinal,'SEM_SINAL');
 await redis.del('sdv:sim:signal-lost');await delay(4300);const restored=(await pool.query('SELECT * FROM "Viatura" WHERE id=$1',[row.id])).rows[0];assert.ok(restored.ultimoSinalEm>offline.ultimoSinalEm);assert.equal(restored.estadoSinal,'OK');
 console.log('PASSOU: perda de GPS congela coordenadas/versão, timeout distinto e heartbeat restaura estado canônico');
}finally{await redis.set('sdv:sim:paused','0');await redis.del('sdv:sim:signal-lost');await Promise.all([pool.end(),redis.quit()]);}
