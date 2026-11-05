import assert from 'node:assert/strict';import pg from 'pg';
if(process.env.NODE_ENV!=='test'||!process.env.VIATURAS_DATABASE_URL?.includes('127.0.0.1'))throw Error('Somente banco local de testes');
const p=new pg.Pool({connectionString:process.env.VIATURAS_DATABASE_URL});const ids=[];
async function gql(query,variables={},token=''){const r=await fetch('http://127.0.0.1:4000/graphql',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({query,variables})});const b=await r.json();if(b.errors)throw Error(JSON.stringify(b.errors));return b.data;}
try{
 const token=(await gql('mutation($s:String!){login(email:"central-a@sdv.local",senha:$s){accessToken}}',{s:process.env.DEMO_ADMIN_PASSWORD})).login.accessToken;
 const v=(await p.query('SELECT id FROM "Viatura" ORDER BY id LIMIT 1')).rows[0].id;
 const read=async day=>(await gql('query($id:ID!,$d:String!){estatisticasViatura(id:$id,dataLocal:$d){despachosIniciadosHoje atendimentosConcluidosHoje canceladosHoje tempoTotalEmDeslocamentoHoje}}',{id:v,d:day},token)).estatisticasViatura;
 const before4=await read('2026-11-04'),before5=await read('2026-11-05');
 for(const [time,status] of [['2026-11-05T02:59:00Z','CONCLUIDO'],['2026-11-05T03:00:00Z','CANCELADO']]){
  const r=await p.query(`INSERT INTO "Despacho" (id,"ocorrenciaId","viaturaId",status,"criadoEm","despachadoEm","concluidoEm",progresso,"simulacaoPausada") VALUES(gen_random_uuid(),gen_random_uuid(),$1,$2,$3::timestamptz,$3::timestamptz,$3::timestamptz,0,false) RETURNING id`,[v,status,time]);ids.push(r.rows[0].id);
 }
 const after4=await read('2026-11-04'),after5=await read('2026-11-05');
 assert.equal(after4.despachosIniciadosHoje,before4.despachosIniciadosHoje+1);assert.equal(after4.atendimentosConcluidosHoje,before4.atendimentosConcluidosHoje+1);assert.equal(after4.canceladosHoje,before4.canceladosHoje);
 assert.equal(after5.despachosIniciadosHoje,before5.despachosIniciadosHoje+1);assert.equal(after5.canceladosHoje,before5.canceladosHoje+1);assert.equal(after5.atendimentosConcluidosHoje,before5.atendimentosConcluidosHoje);
 const first=(await gql('query($id:ID!){despachosViatura(id:$id,limit:1){id}}',{id:v},token)).despachosViatura;
 const next=(await gql('query($id:ID!,$c:ID!){despachosViatura(id:$id,cursor:$c,limit:1){id}}',{id:v,c:first[0].id},token)).despachosViatura;assert.equal(first.length,1);assert.equal(next.length,1);assert.notEqual(first[0].id,next[0].id);
 console.log('PASSOU: fronteira 02:59/03:00 UTC em America/Bahia e distinção entre concluídos e cancelados e paginação por cursor via GraphQL/PostgreSQL');
}finally{for(const id of ids)await p.query('DELETE FROM "Despacho" WHERE id=$1',[id]);await p.end();}
