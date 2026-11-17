import type {Dispatch,Vehicle} from '../types';
import {signal} from '../components/OperationsMap';
import {formatClock,formatDuration} from './time';
export type EtaTone='live'|'ok'|'warn'|'muted';
/** Resumo de uma linha do deslocamento, para listas. O detalhe completo continua em <ArrivalInfo/>. */
export function etaBrief(d:Dispatch|undefined,vehicle:Vehicle|undefined,paused:boolean,now=Date.now(),factor=1):{text:string;tone:EtaTone}{
 if(!d)return {text:'Aguardando viatura livre',tone:'warn'};
 if(['CONCLUIDO','CANCELADO'].includes(d.status))return {text:d.status==='CONCLUIDO'?'Atendimento concluído':'Despacho cancelado',tone:'muted'};
 if(d.chegadaEm)return {text:`No local desde ${formatClock(d.chegadaEm)}`,tone:'ok'};
 if(paused||d.simulacaoPausada)return {text:'Deslocamento pausado',tone:'muted'};
 if(vehicle&&signal(vehicle)!=='Sinal OK')return {text:'Sem sinal · ETA suspenso',tone:'warn'};
 if(!d.rota)return {text:'Calculando rota…',tone:'muted'};
 const predicted=d.previsaoChegadaEm?Date.parse(d.previsaoChegadaEm):NaN;
 const remaining=d.etaAtualSegundos??(d.duracaoSegundos!=null?d.duracaoSegundos*(1-d.progresso):null);
 const seconds=Number.isFinite(predicted)?Math.max(0,(predicted-now)/1000):remaining==null?null:remaining/factor;
 return seconds==null?{text:'ETA em cálculo',tone:'muted'}:{text:seconds<30?'Chegando agora':`Chega em ${formatDuration(seconds)}`,tone:'live'};
}
