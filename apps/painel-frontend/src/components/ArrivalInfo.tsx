import type {Dispatch,Vehicle} from '../types';
import {formatDuration} from '../lib/presentation';
import {signal} from './OperationsMap';
export function ArrivalInfo({dispatch:d,vehicle,paused=false,factor=1}:{dispatch?:Dispatch;vehicle?:Vehicle;paused?:boolean;factor?:number}){
 if(!d)return <span>ETA indisponível · Aguardando alocação</span>;
 const initial=d.previsaoChegadaInicialEm?Date.parse(d.previsaoChegadaInicialEm):NaN;
 const arrival=d.chegadaEm?Date.parse(d.chegadaEm):NaN;
 const predicted=d.previsaoChegadaEm?Date.parse(d.previsaoChegadaEm):NaN;
 const observed=d.saidaEm&&d.chegadaEm?(arrival-Date.parse(d.saidaEm))/1000:null;
 const delta=((Number.isFinite(arrival)?arrival:predicted)-initial)/1000;
 const difference=Number.isFinite(delta)?Math.abs(delta)<1?'Na previsão inicial':`${formatDuration(Math.abs(delta))} ${delta>0?'depois':'antes'} da previsão inicial`:'Comparação com a previsão inicial indisponível';
 if(d.chegadaEm)return <span className="arrival-info"><strong>Chegada registrada · {formatDuration(observed)} em deslocamento</strong><span>{difference}</span><small>Tempo de relógio da simulação; inclui pausas e mudanças de velocidade.</small></span>;
 if(paused||d.simulacaoPausada)return <span>Simulação pausada · ETA suspenso</span>;
 if(vehicle&&signal(vehicle)!=='Sinal OK')return <span>ETA indisponível · Sinal atrasado ou ausente</span>;
 if(!d.rota)return <span>ETA indisponível · Aguardando rota</span>;
 const seconds=Number.isFinite(predicted)?Math.max(0,(predicted-Date.now())/1000):(d.etaAtualSegundos??(d.duracaoSegundos??0)*(1-d.progresso))/factor;
 return <span className="arrival-info"><strong>ETA restante · {formatDuration(seconds)}</strong><span>{difference}</span>{factor>1&&<small>Laboratório acelerado em {factor}× · comparação em tempo de relógio</small>}</span>;
}
