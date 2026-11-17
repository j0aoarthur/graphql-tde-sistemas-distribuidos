import {gql} from '../api';
import type {Dispatch,Incident} from '../types';
/** A Arena é uma ferramenta de DEMONSTRAÇÃO: só aparece com VITE_DEMO_ARENA=1 e o backend em modo demo. */
export const ARENA_ENABLED=import.meta.env.VITE_DEMO_ARENA==='1';
export const ARENA_TAG='[ARENA]';
/** Ponto fixo no Centro de Feira de Santana: todos os chamados disputam as mesmas viaturas mais próximas. */
export const ARENA_POINT:[number,number]=[-12.2664,-38.9663];
export type ArenaState={ativa:boolean;livres:number;reservadas:number;workers:number;rastroAtivo:boolean;modoDemo:boolean;lockRedis:boolean};
const STATE='livres reservadas ativa workers rastroAtivo modoDemo lockRedis';
export const fetchArena=(token:string)=>gql<{estadoArena:ArenaState}>(`query{estadoArena{${STATE}}}`,{},token).then(d=>d.estadoArena);
export const prepareArena=(token:string,livres:number)=>gql<{prepararArena:ArenaState}>(`mutation($k:Int!,$a:Float!,$b:Float!){prepararArena(livres:$k,latitude:$a,longitude:$b){${STATE}}}`,{k:livres,a:ARENA_POINT[0],b:ARENA_POINT[1]},token).then(d=>d.prepararArena);
export const setArenaLock=(token:string,lockRedis:boolean)=>gql<{configurarArena:ArenaState}>(`mutation($l:Boolean!){configurarArena(lockRedis:$l){${STATE}}}`,{l:lockRedis},token).then(d=>d.configurarArena);
export const restoreArena=(token:string)=>gql<{restaurarArena:ArenaState}>(`mutation{restaurarArena{${STATE}}}`,{},token).then(d=>d.restaurarArena);

export const isArenaIncident=(o:Incident)=>!!o.descricao?.startsWith(ARENA_TAG);
export const isLive=(o:Incident)=>!['CANCELADA','ENCERRADA'].includes(o.status);
export const chamadoNumero=(o:Pick<Incident,'tipo'>)=>Number(/chamado\s+(\d+)/i.exec(o.tipo)?.[1])||0;
export const DISPATCHED=['DESPACHADA','EM_ATENDIMENTO'];
export const WAITING=['RECEBIDA','AGUARDANDO_VIATURA'];
const ACTIVE_DISPATCH=['CONFIRMADO','EM_DESLOCAMENTO','NO_LOCAL','EM_ATENDIMENTO'];
/** Equivalente ao `SELECT "viaturaId" ... GROUP BY 1 HAVING count(*)>1` sobre despachos ativos. */
export function duplicatedVehicles(dispatches:Dispatch[]):string[]{
  const seen=new Map<string,number>();
  for(const d of dispatches)if(ACTIVE_DISPATCH.includes(d.status))seen.set(d.viaturaId,(seen.get(d.viaturaId)??0)+1);
  return [...seen].filter(([,n])=>n>1).map(([id])=>id);
}
const MIX=[3,5,2,4,3,1,4,3];
/** Abre N chamados no mesmo instante (um POST por chamado, todos disparados antes de qualquer await). */
export async function fireCalls(token:string,n:number,mixPriority:boolean){
  const calls=Array.from({length:n},(_,i)=>{
    const numero=i+1,jitter=((i%5)-2)*0.00012; // ~±25 m: pontos próximos, mas distinguíveis no mapa
    return gql<{abrirOcorrencia:{id:string}}>('mutation($i:AbrirOcorrenciaInput!){abrirOcorrencia(input:$i){id}}',{i:{
      tipo:`Arena chamado ${String(numero).padStart(2,'0')}`,descricao:`${ARENA_TAG} Chamado simultâneo ${numero} de ${n}`,
      enderecoFormatado:'Centro, Feira de Santana - BA',bairro:'Centro',origemLocalizacao:'PIN',precisaoLocalizacao:'PONTO',localConfirmado:true,
      prioridade:mixPriority?MIX[i%MIX.length]:3,latitude:ARENA_POINT[0]+jitter,longitude:ARENA_POINT[1]-jitter,clientRequestId:crypto.randomUUID()}},token);
  });
  const results=await Promise.allSettled(calls);
  return {ok:results.filter(r=>r.status==='fulfilled').length,failed:results.filter(r=>r.status==='rejected').length};
}
export const cancelCall=(token:string,id:string,motivo:string)=>gql<{cancelarOcorrencia:{id:string}}>('mutation($id:ID!,$m:String!){cancelarOcorrencia(id:$id,motivo:$m){id}}',{id,m:motivo},token);
