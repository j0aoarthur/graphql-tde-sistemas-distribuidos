/** Executar uma única vez no VPC (por exemplo, ECS run-task) após provisionar o RDS. */
import pg from 'pg';
const {Client}=pg;
const defs=[['ocorrencias_db','OCC_DATABASE_URL'],['viaturas_db','VIATURAS_DATABASE_URL']];
for(const [name,key] of defs){
 const raw=process.env[key];if(!raw)throw Error(`${key} ausente`);
 const url=new URL(raw);url.pathname='/postgres';
 const client=new Client({connectionString:url.toString()});
 try {await client.connect();
  const existing=await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[name]);
  if(!existing.rowCount){await client.query(`CREATE DATABASE "${name}"`);console.log(`Criado: ${name}`);}else console.log(`Já existe: ${name}`);
 }finally{await client.end();}
}
