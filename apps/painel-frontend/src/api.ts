import {accessToken,refreshSession,sessionToken} from './session';
import {createClient} from 'graphql-ws';
import {reconcileList} from '@sdv/shared/state';
import type {Snapshot} from './types';
const API=import.meta.env.VITE_GRAPHQL_URL||'/graphql';
const WS=import.meta.env.VITE_GRAPHQL_WS_URL||`${location.protocol==='https:'?'wss':'ws'}://${location.host}/subscriptions`;
export const VEHICLE_FIELDS=`id placa status latitude longitude capacidade versao atualizadoEm ultimoSinalEm ultimaPosicaoEm ultimoMovimentoEm direcaoGraus versaoPosicao patrulhaRota patrulhaProgresso operandoDesde`;
export const INCIDENT_FIELDS=`id versao centralId tipo prioridade latitude longitude status viaturaId criadoEm atualizadoEm descricao enderecoFormatado referencia eventos{id tipo ocorridoEm origemServico descricao}`;
export const DISPATCH_FIELDS=`id versao ocorrenciaId viaturaId status distanciaMetros duracaoSegundos progresso rota simulacaoPausada criadoEm concluidoEm chegadaEm saidaEm etaOriginalSegundos`;
export const SNAPSHOT_QUERY=`query PainelOperacional {me{id nome email centralId papel} listarCentrais{id nome codigo ativo} listarViaturas{${VEHICLE_FIELDS}} listarOcorrencias{${INCIDENT_FIELDS}} listarDespachos{${DISPATCH_FIELDS}} estadoSimulacao{fator pausada sinalIndisponivel}}`;
export function reconcile(previous:Snapshot|null,next:Snapshot):Snapshot{if(!previous)return next;return {...next,listarViaturas:reconcileList(previous.listarViaturas,next.listarViaturas),listarOcorrencias:reconcileList(previous.listarOcorrencias,next.listarOcorrencias),listarDespachos:reconcileList(previous.listarDespachos,next.listarDespachos)};}
export async function positionDelta(token:string,id:string,current:Snapshot){
 const d=current.listarDespachos.find(d=>d.viaturaId===id&&!['CONCLUIDO','CANCELADO'].includes(d.status));
 const data=await gql<any>(`query($id:ID!${d?',$dispatch:ID!':''}){consultarViatura(id:$id){${VEHICLE_FIELDS}} ${d?`consultarDespacho(id:$dispatch){${DISPATCH_FIELDS}}`:''}}`,{id,...(d?{dispatch:d.id}:{})},token);
 return (previous:Snapshot|null)=>{if(!previous)return previous;return reconcile(previous,{...previous,listarViaturas:previous.listarViaturas.map(v=>v.id===id?(data.consultarViatura??v):v),listarDespachos:previous.listarDespachos.map(v=>v.id===d?.id?(data.consultarDespacho??v):v)});};
}
export async function gql<T>(query:string,variables:Record<string,unknown>={},token='',retry=true):Promise<T>{
  token=token?(accessToken()||token):'';
  const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({query,variables}),cache:'no-store'});
  let body:any;try{body=await r.json();}catch{throw Error('Resposta inválida do gateway. Verifique a conexão.');}
  if(retry&&token&&(r.status===401||body.errors?.some((e:any)=>e.extensions?.code==='UNAUTHENTICATED'||e.extensions?.originalError?.statusCode===401))){const renewed=await refreshSession();return gql<T>(query,variables,renewed,false);}
  if(!r.ok||body.errors?.length)throw Error(body.errors?.map((x:any)=>x.message).join('; ')||`Erro HTTP ${r.status}`);
  return body.data as T;
}
export const getSnapshot=(token:string)=>gql<Snapshot>(SNAPSHOT_QUERY,{},token);
export function watchUpdates(token:string,onUpdate:(event?:{tipo:string;entidadeId:string})=>void,onStatus:(connected:boolean)=>void){
  const client=createClient({url:WS,connectionParams:async()=>({authorization:`Bearer ${await sessionToken()}`}),lazy:true,retryAttempts:Infinity,shouldRetry:()=>true,on:{connected:()=>{onStatus(true);onUpdate();},closed:(event:unknown)=>{onStatus(false);if((event as CloseEvent).code===4403)void refreshSession().catch(()=>{});}}});
  const unsubscribe=client.subscribe<{eventoSDV:{tipo:string;entidadeId:string}} >({query:'subscription {eventoSDV{tipo entidadeId timestamp}}'}, {
    next:(data)=>{onStatus(true);onUpdate(data.data?.eventoSDV);},
    error:()=>onStatus(false),complete:()=>onStatus(false),
  });
  return ()=>{unsubscribe();void client.dispose();};
}
