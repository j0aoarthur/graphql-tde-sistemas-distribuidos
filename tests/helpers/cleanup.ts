import {expect,type APIRequestContext} from '@playwright/test';
/** Cancel only IDs created by the calling test, through the public authorized API. */
export async function cancelCreated(request:APIRequestContext,ids:string[],token?:string){
 if(!ids.length)return;
 const call=async(query:string,variables:Record<string,unknown>={})=>{const r=await request.post('http://127.0.0.1:4000/graphql',{headers:token?{authorization:`Bearer ${token}`}:{},data:{query,variables}});const body=await r.json();expect(body.errors).toBeUndefined();return body.data;};
 if(!token)token=(await call('mutation($s:String!){login(email:"central-a@sdv.local",senha:$s){accessToken}}',{s:process.env.DEMO_ADMIN_PASSWORD})).login.accessToken;
 for(const id of ids){const state=(await call('query($id:ID!){consultarOcorrencia(id:$id){status}}',{id})).consultarOcorrencia.status;if(['ENCERRADA','CANCELADA'].includes(state))continue;
  if(!['CANCELAMENTO_PENDENTE','ENCERRAMENTO_PENDENTE'].includes(state))await call('mutation($id:ID!){cancelarOcorrencia(id:$id,motivo:"Limpeza de cenário automatizado"){id}}',{id});
  await expect.poll(async()=>['ENCERRADA','CANCELADA'].includes((await call('query($id:ID!){consultarOcorrencia(id:$id){status}}',{id})).consultarOcorrencia.status),{timeout:12000}).toBe(true);
 }
}

/** Remove only this scenario's available vehicle from an explicitly local test database. */
export async function removeCreatedVehicle(id:string,plate:string){
 if(!id)return;
 if(process.env.NODE_ENV!=='test'||!/^postgres(?:ql)?:\/\/[^/]+@(127\.0\.0\.1|localhost):\d+\/viaturas_db$/.test(process.env.VIATURAS_DATABASE_URL??''))throw Error('Limpeza exige banco local isolado de testes');
 const {Pool}=await import('pg');const pool=new Pool({connectionString:process.env.VIATURAS_DATABASE_URL}),client=await pool.connect();
 try{
  await client.query('BEGIN');const own=await client.query('SELECT id FROM "Viatura" WHERE id=$1 AND placa=$2 FOR UPDATE',[id,plate]);expect(own.rowCount).toBe(1);
  await client.query('DELETE FROM "Patrulha" WHERE "viaturaId"=$1',[id]);await client.query('DELETE FROM "TurnoViatura" WHERE "viaturaId"=$1',[id]);
  const removed=await client.query('DELETE FROM "Viatura" WHERE id=$1 AND placa=$2 AND status=\'DISPONIVEL\'',[id,plate]);expect(removed.rowCount).toBe(1);await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await pool.end();}
}
