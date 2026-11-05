import type {Snapshot,Incident,Vehicle,Dispatch} from './types';
const NOW=new Date();const ago=(m:number)=>new Date(NOW.getTime()-m*60000).toISOString();
const coords:[number,number][]=[[-12.255,-38.968],[-12.242,-38.955],[-12.273,-38.970],[-12.254,-38.989],[-12.263,-38.950],[-12.283,-38.962],[-12.240,-38.981],[-12.270,-38.941],[-12.251,-38.934],[-12.292,-38.985],[-12.228,-38.968],[-12.277,-39.000]];
const statuses=['OCUPADA','DISPONIVEL','DISPONIVEL','OCUPADA','DISPONIVEL','NO_LOCAL','DISPONIVEL','DISPONIVEL','OCUPADA','DISPONIVEL','DISPONIVEL','DISPONIVEL'];
const fleet:Vehicle[]=coords.map(([latitude,longitude],i)=>({id:`demo-v-${i+1}`,placa:`SDV${String(i+1).padStart(3,'0')}`,status:statuses[i],latitude,longitude,capacidade:i%3===0?4:2,versao:8+i,atualizadoEm:ago(i)}));
const incidents:Incident[]=[
 ['Acidente de trânsito',5,-12.258,-38.972,'DESPACHADA',0,4],
 ['Atendimento médico',4,-12.268,-38.956,'EM_ATENDIMENTO',5,12],
 ['Suspeita de roubo',5,-12.247,-38.991,'DESPACHADA',3,18],
 ['Ocorrência residencial',3,-12.274,-38.981,'AGUARDANDO_VIATURA',-1,24],
 ['Apoio preventivo',2,-12.236,-38.965,'ENCERRADA',-1,42],
 ['Acidente sem vítimas',3,-12.284,-38.948,'ENCERRADA',-1,88],
 ['Averiguação',2,-12.263,-38.984,'CANCELADA',-1,120],
 ].map(([tipo,prioridade,latitude,longitude,status,vehicle,minutes],i)=>({id:`demo-o-${i+1}`,centralId:i%2?'central-b':'central-a',tipo:String(tipo),prioridade:Number(prioridade),latitude:Number(latitude),longitude:Number(longitude),status:String(status),viaturaId:Number(vehicle)>=0?fleet[Number(vehicle)].id:null,criadoEm:ago(Number(minutes)),atualizadoEm:ago(Number(minutes)-1)}));
const dispatches:Dispatch[]=incidents.filter(o=>o.viaturaId).map((o,i)=>{
  const v=fleet.find(v=>v.id===o.viaturaId)!;
  const rota=JSON.stringify([[v.latitude,v.longitude],[(v.latitude+o.latitude)/2+0.002,(v.longitude+o.longitude)/2-0.002],[o.latitude,o.longitude]]);
  return{id:`demo-d-${i}`,ocorrenciaId:o.id,viaturaId:v.id,status:i===1?'NO_LOCAL':'EM_DESLOCAMENTO',progresso:i===1?1:0.22+i*.2,distanciaMetros:2400+i*1000,duracaoSegundos:380+i*130,simulacaoPausada:false,rota,criadoEm:o.criadoEm,viatura:v};
});
export function buildDemo():Snapshot{return {me:{id:'demo-admin',nome:'Operador demonstrativo',email:'central-a@sdv.local',centralId:'central-a',papel:'ADMIN'},listarCentrais:[{id:'central-a',nome:'Central Norte',codigo:'CENTRAL_A',ativo:true},{id:'central-b',nome:'Central Sul',codigo:'CENTRAL_B',ativo:true}],listarViaturas:fleet, listarOcorrencias:incidents, listarDespachos:dispatches,estadoSimulacao:{fator:12,pausada:false,sinalIndisponivel:false}};}
export const DEMO_ENABLED=import.meta.env.VITE_ENABLE_DEMO==='true';
