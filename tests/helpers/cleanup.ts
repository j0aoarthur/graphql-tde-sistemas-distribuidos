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
