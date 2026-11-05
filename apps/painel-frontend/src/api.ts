import {accessToken,refreshSession} from './session';
import {createClient} from 'graphql-ws';
import type {Snapshot} from './types';
const API=import.meta.env.VITE_GRAPHQL_URL||'/graphql';
const WS=import.meta.env.VITE_GRAPHQL_WS_URL||`${location.protocol==='https:'?'wss':'ws'}://${location.host}/subscriptions`;
export const SNAPSHOT_QUERY=`query PainelOperacional {
 me {id nome email centralId papel}
 listarCentrais {id nome codigo ativo}
 listarViaturas {id placa status latitude longitude capacidade versao atualizadoEm}
 listarOcorrencias {id centralId tipo prioridade latitude longitude status viaturaId criadoEm atualizadoEm}
 listarDespachos {id ocorrenciaId viaturaId status distanciaMetros duracaoSegundos progresso rota simulacaoPausada criadoEm concluidoEm viatura{id placa status latitude longitude capacidade versao atualizadoEm}}
 estadoSimulacao {fator pausada sinalIndisponivel}
}`;
export async function gql<T>(query:string,variables:Record<string,unknown>={},token='',retry=true):Promise<T>{
  token=token?(accessToken()||token):'';
  const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({query,variables}),cache:'no-store'});
  let body:any;try{body=await r.json();}catch{throw Error('Resposta inválida do gateway. Verifique a conexão.');}
  if(retry&&token&&(r.status===401||body.errors?.some((e:any)=>e.extensions?.code==='UNAUTHENTICATED'||e.extensions?.originalError?.statusCode===401))){const renewed=await refreshSession();return gql<T>(query,variables,renewed,false);}
  if(!r.ok||body.errors?.length)throw Error(body.errors?.map((x:any)=>x.message).join('; ')||`Erro HTTP ${r.status}`);
  return body.data as T;
}
export const getSnapshot=(token:string)=>gql<Snapshot>(SNAPSHOT_QUERY,{},token);
export function watchUpdates(token:string,onUpdate:()=>void,onStatus:(connected:boolean)=>void){
  const client=createClient({url:WS,connectionParams:async()=>({authorization:`Bearer ${accessToken()||token}`}),lazy:true,retryAttempts:Infinity,shouldRetry:()=>true,on:{connected:()=>{onStatus(true);onUpdate();},closed:(event:unknown)=>{onStatus(false);if((event as CloseEvent).code===4403)void refreshSession().catch(()=>{});}}});
  const unsubscribe=client.subscribe<{eventoSDV:{tipo:string}} >({query:'subscription {eventoSDV{tipo entidadeId timestamp}}'}, {
    next:()=>{onStatus(true);onUpdate();},
    error:()=>onStatus(false),complete:()=>onStatus(false),
  });
  return ()=>{unsubscribe();void client.dispose();};
}
