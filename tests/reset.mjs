// Explicitly destructive only to this task's LOCAL disposable test databases.
import pg from 'pg';import Redis from 'ioredis';
if(process.env.NODE_ENV!=='test'||process.env.SDV_ALLOW_TEST_RESET!=='1')throw Error('Exige teste isolado e SDV_ALLOW_TEST_RESET=1');
for(const key of ['OCC_DATABASE_URL','VIATURAS_DATABASE_URL']){
 const url=new URL(process.env[key]);if(url.hostname!=='127.0.0.1'||!['/ocorrencias_db','/viaturas_db'].includes(url.pathname))throw Error('Reset restrito aos bancos locais de teste');
 const p=new pg.Pool({connectionString:url.toString()});try{const {rows}=await p.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations'`);for(const row of rows)await p.query(`TRUNCATE TABLE "${row.tablename.replaceAll('"','""')}" CASCADE`);}finally{await p.end();}
}
const redisUrl=new URL(process.env.REDIS_URL);if(redisUrl.hostname!=='127.0.0.1')throw Error('Redis não local');
const r=new Redis(redisUrl.toString());for(const k of await r.keys('sdv:*'))await r.del(k);await r.quit();console.log('Bancos locais e chaves de teste SDV reinicializados');
