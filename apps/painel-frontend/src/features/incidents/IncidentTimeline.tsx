import {useMemo,useState} from 'react';
import {AlertTriangle,Check,ChevronDown,Flag,MapPin,Radio,Siren,Truck,type LucideIcon} from 'lucide-react';
import {ArrivalInfo} from '../../components/ArrivalInfo';
import {formatDuration} from '../../lib/time';
import {vehicleRef} from '../../lib/vehicle';
import type {Dispatch,Incident,Vehicle} from '../../types';
type Evento=NonNullable<Incident['eventos']>[number];
type Tone='info'|'ok'|'warn'|'bad'|'neutral';
const TZ='America/Bahia';
// Mesmo formato de duração do restante do painel (ver lib/time.ts).
export const shortSpan=formatDuration;
const clock=(raw:string)=>new Date(raw).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:TZ});
const day=(raw:string)=>new Date(raw).toLocaleDateString('pt-BR',{timeZone:TZ});
const dayLong=(raw:string)=>new Date(raw).toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',timeZone:TZ});
const dayShort=(raw:string)=>new Date(raw).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',timeZone:TZ});
// `technical`: detalhe interno do sistema, escondido por padrão. `human`: ação de uma pessoa (mostra o autor).
const KINDS:Record<string,{tone:Tone;icon:LucideIcon;technical?:boolean;human?:boolean;label?:(plate?:string)=>string}>={
 OCORRENCIA_CRIADA:{tone:'info',icon:Siren,human:true,label:()=>'Ocorrência registrada'},
 DESPACHO_CONFIRMADO:{tone:'info',icon:Truck,label:p=>p?`${p} despachada`:'Viatura despachada'},
 ROTA_CALCULADA:{tone:'neutral',icon:Check,technical:true,label:()=>'Rota calculada'},
 DESLOCAMENTO_INICIADO:{tone:'neutral',icon:Check,technical:true,label:()=>'Deslocamento iniciado'},
 VIATURA_CHEGOU:{tone:'ok',icon:MapPin,label:()=>'Viatura chegou ao local'},
 FINALIZACAO_SOLICITADA:{tone:'warn',icon:Flag,human:true},
 DESPACHO_FINALIZADO:{tone:'ok',icon:Check},
 SINAL_PERDIDO:{tone:'bad',icon:AlertTriangle,label:()=>'Sinal de GPS perdido'},
 SINAL_RESTABELECIDO:{tone:'ok',icon:Radio,label:()=>'Sinal de GPS restabelecido'},
};
const kindOf=(e:Evento)=>KINDS[e.tipo]??{tone:'neutral' as Tone,icon:Check};
// Cancelamento não é um desfecho "bom": não pinta de verde.
const toneOf=(e:Evento):Tone=>e.tipo==='DESPACHO_FINALIZADO'&&/cancel/i.test(e.descricao)?'neutral':kindOf(e).tone;

function Summary({dispatch:d,vehicle,paused,factor}:{dispatch?:Dispatch;vehicle?:Vehicle;paused:boolean;factor:number}){
 if(!d)return <p className="tl-empty">Aguardando alocação de viatura.</p>;
 if(!d.chegadaEm)return <div className="tl-live"><ArrivalInfo dispatch={d} vehicle={vehicle} paused={paused} factor={factor}/></div>;
 const arrival=Date.parse(d.chegadaEm),initial=d.previsaoChegadaInicialEm?Date.parse(d.previsaoChegadaInicialEm):NaN;
 const travel=d.saidaEm?(arrival-Date.parse(d.saidaEm))/1000:null,delta=Number.isFinite(initial)?(arrival-initial)/1000:null;
 const verdict=delta==null?{text:'Indisponível',tone:'neutral'}:Math.abs(delta)<1?{text:'Na previsão',tone:'ok'}:delta<0?{text:`${shortSpan(-delta)} antes`,tone:'ok'}:{text:`${shortSpan(delta)} depois`,tone:'warn'};
 return <div className="tl-summary" role="group" aria-label="Resumo do deslocamento">
  <div className="tl-stat"><abbr title="Tempo de relógio da simulação; inclui pausas e mudanças de velocidade.">Deslocamento</abbr><b>{travel==null?'—':shortSpan(travel)}</b></div>
  <div className="tl-stat"><span>Previsão inicial</span><b>{d.etaOriginalSegundos?shortSpan(d.etaOriginalSegundos):'—'}</b></div>
  <div className={`tl-stat tl-stat--${verdict.tone}`}><span>Resultado</span><b>{verdict.text}</b></div>
 </div>;
}

export function IncidentTimeline({dispatch,vehicle,events,paused,factor}:{dispatch?:Dispatch;vehicle?:Vehicle;events?:Evento[];paused:boolean;factor:number}){
 const[showTech,setShowTech]=useState(false);
 const sorted=useMemo(()=>[...(events??[])].sort((a,b)=>Date.parse(a.ocorridoEm)-Date.parse(b.ocorridoEm)),[events]);
 const techCount=sorted.filter(e=>kindOf(e).technical).length;
 const visible=sorted.filter(e=>showTech||!kindOf(e).technical);
 const multiDay=new Set(sorted.map(e=>day(e.ocorridoEm))).size>1;
 return <>
  <Summary dispatch={dispatch} vehicle={vehicle} paused={paused} factor={factor}/>
  {sorted.length===0?<p className="tl-empty">Histórico não registrado para esta ocorrência.</p>:<>
   {!multiDay&&<p className="tl-day">{dayLong(sorted[0].ocorridoEm)}</p>}
   <div className="timeline timeline--v2" role="list" aria-label="Eventos da ocorrência">
    {visible.map((e,i)=>{
     const k=kindOf(e),Icon=k.icon,label=k.label?k.label(vehicle?vehicleRef(vehicle):undefined):e.descricao;
     const gap=i>0?(Date.parse(e.ocorridoEm)-Date.parse(visible[i-1].ocorridoEm))/1000:0;
     // Autor só nas ações humanas; origem técnica (OCORRENCIAS/VIATURAS) só no modo "detalhes técnicos".
     const meta=[k.human?(e.autor?`por ${e.autor}`:'autoria não registrada'):'',showTech&&k.technical?e.origemServico:'',i>0&&gap>=1?`+${shortSpan(gap)}`:''].filter(Boolean).join(' · ');
     return <div key={e.id} role="listitem" className={`tl-item tl-${toneOf(e)}${k.technical?' tl-tech':''}`}>
      <i aria-hidden="true"><Icon size={13}/></i><strong>{label}</strong>
      <small className="tl-time">{multiDay?`${dayShort(e.ocorridoEm)} `:''}{clock(e.ocorridoEm)}</small>
      {meta&&<small className="tl-meta">{meta}</small>}
     </div>;})}
   </div>
   {techCount>0&&<button type="button" className="tl-toggle" aria-expanded={showTech} onClick={()=>setShowTech(v=>!v)}><ChevronDown size={15} aria-hidden="true" style={{transform:showTech?'rotate(180deg)':undefined}}/>{showTech?'Ocultar detalhes técnicos':`Mostrar detalhes técnicos (${techCount})`}</button>}
  </>}
 </>;
}
