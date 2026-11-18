import {useEffect,useState} from 'react';
import {CalendarClock,CheckCircle2,Clock3,Flag,History,MapPin,Navigation,Siren,XCircle} from 'lucide-react';
import {gql} from '../../api';
import {accessToken} from '../../session';
import {formatClock,formatDayLabel,formatDuration,formatMoment,sameDay,useNow} from '../../lib/time';
import {buildDemoInsights} from '../../demo';
import {Badge} from '../../components/ui';
import type {Incident} from '../../types';

export type VehicleStats={operandoDesde?:string|null;situacaoSinal:string;despachosIniciadosHoje:number;atendimentosConcluidosHoje:number;canceladosHoje:number;tempoTotalEmDeslocamentoHoje:number};
export type VehicleDispatchEntry={id:string;ocorrenciaId?:string;status:string;despachadoEm:string;saidaEm?:string|null;chegadaEm?:string|null;concluidoEm?:string|null};
const PAGE=20;
const STATS_QUERY='query($id:ID!){estatisticasViatura(id:$id){despachosIniciadosHoje atendimentosConcluidosHoje canceladosHoje operandoDesde ultimoSinalEm situacaoSinal tempoTotalEmDeslocamentoHoje}}';
const HISTORY_QUERY='query($id:ID!,$cursor:ID){despachosViatura(id:$id,cursor:$cursor,limit:20){id ocorrenciaId status despachadoEm saidaEm chegadaEm concluidoEm}}';

/** Painel "Turno e hoje" + histórico agrupado por dia. */
export function VehicleInsights({vehicleId,incidents,demo}:{vehicleId:string;incidents:Incident[];demo:boolean}){
 const[stats,setStats]=useState<VehicleStats|null>(null),[history,setHistory]=useState<VehicleDispatchEntry[]>([]),[more,setMore]=useState(false),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[loadingMore,setLoadingMore]=useState(false);
 useEffect(()=>{
  let active=true;setStats(null);setHistory([]);setFailed(false);setLoading(true);setMore(false);
  if(demo){const d=buildDemoInsights(vehicleId);setStats(d.stats);setHistory(d.history);setLoading(false);return;}
  void Promise.all([gql<{estatisticasViatura:VehicleStats}>(STATS_QUERY,{id:vehicleId},accessToken()),gql<{despachosViatura:VehicleDispatchEntry[]}>(HISTORY_QUERY,{id:vehicleId},accessToken())])
   .then(([s,h])=>{if(!active)return;setStats(s.estatisticasViatura);setHistory(h.despachosViatura);setMore(h.despachosViatura.length===PAGE);})
   .catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[vehicleId,demo]);
 async function loadMore(){
  setLoadingMore(true);
  try{const next=await gql<{despachosViatura:VehicleDispatchEntry[]}>(HISTORY_QUERY,{id:vehicleId,cursor:history.at(-1)?.id},accessToken());setHistory(prev=>[...prev,...next.despachosViatura.filter(x=>!prev.some(p=>p.id===x.id))]);setMore(next.despachosViatura.length===PAGE);}
  catch{setFailed(true);}finally{setLoadingMore(false);}
 }
 if(loading)return <section className="dw-section" aria-busy="true"><div className="dw-skeleton"/><div className="dw-skeleton dw-skeleton--short"/></section>;
 if(failed&&!stats)return <section className="dw-section"><p className="dw-note dw-note--warn">Não foi possível carregar o turno e o histórico desta viatura. Tente reabrir os detalhes.</p></section>;
 return <>
  {stats&&<ShiftAndToday stats={stats}/>}
  <section className="dw-section" aria-labelledby="vehicle-history-title">
   <h3 id="vehicle-history-title" className="dw-title"><History size={15} aria-hidden="true"/>Histórico de atendimentos</h3>
   <HistoryList entries={history} incidents={incidents}/>
   {failed&&<p className="dw-note dw-note--warn">Não foi possível carregar mais registros.</p>}
   {more&&<button type="button" className="btn btn-outline btn-wide" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?'Carregando…':'Carregar registros mais antigos'}</button>}
  </section>
 </>;
}

function ShiftAndToday({stats}:{stats:VehicleStats}){
 const now=useNow(15000);
 const onDuty=stats.operandoDesde?Math.max(0,(now-Date.parse(stats.operandoDesde))/1000):null;
 return <>
  <section className="dw-section" aria-labelledby="vehicle-shift-title">
   <h3 id="vehicle-shift-title" className="dw-title"><CalendarClock size={15} aria-hidden="true"/>Turno</h3>
   {onDuty==null?<p className="dw-note">Turno não iniciado.</p>:
    <div className="dw-shift"><div><span className="dw-caption">Em serviço há</span><strong className="dw-big">{formatDuration(onDuty)}</strong></div><div className="dw-shift-since"><span className="dw-caption">Desde</span><b>{formatMoment(stats.operandoDesde,now)}</b></div></div>}
  </section>
  <section className="dw-section" aria-labelledby="vehicle-today-title">
   <h3 id="vehicle-today-title" className="dw-title"><Flag size={15} aria-hidden="true"/>Hoje</h3>
   <div className="dw-tiles">
    <div className="dw-tile"><strong>{stats.despachosIniciadosHoje}</strong><span>Despachos</span></div>
    <div className="dw-tile dw-tile--ok"><strong>{stats.atendimentosConcluidosHoje}</strong><span>Concluídos</span></div>
    <div className="dw-tile dw-tile--muted"><strong>{stats.canceladosHoje}</strong><span>Cancelados</span></div>
   </div>
   <p className="dw-inline"><Navigation size={14} aria-hidden="true"/><span>Tempo em deslocamento hoje: <b>{formatDuration(stats.tempoTotalEmDeslocamentoHoje)}</b></span></p>
  </section>
 </>;
}

const OUTCOME:Record<string,{icon:typeof CheckCircle2;tone:string}>={CONCLUIDO:{icon:CheckCircle2,tone:'ok'},CANCELADO:{icon:XCircle,tone:'muted'}};
function HistoryList({entries,incidents}:{entries:VehicleDispatchEntry[];incidents:Incident[]}){
 const now=useNow(30000);
 if(!entries.length)return <p className="dw-note">Esta viatura ainda não foi despachada.</p>;
 return <ol className="hist" aria-label="Despachos da viatura, do mais recente ao mais antigo">
  {entries.map((e,i)=>{
   const incident=incidents.find(o=>o.id===e.ocorrenciaId),outcome=OUTCOME[e.status]??{icon:Siren,tone:'live'},Icon=outcome.icon;
   const start=e.saidaEm??e.despachadoEm,travel=e.chegadaEm?(Date.parse(e.chegadaEm)-Date.parse(start))/1000:null;
   const newDay=i===0||!sameDay(entries[i-1].despachadoEm,e.despachadoEm);
   return <li key={e.id} className="hist-item">
    {newDay&&<div className="hist-day" role="presentation">{formatDayLabel(e.despachadoEm,now)}</div>}
    <div className={`hist-card hist-card--${outcome.tone}`}>
     <i aria-hidden="true"><Icon size={16}/></i>
     <div className="hist-main"><strong>{incident?.tipo??'Ocorrência'}</strong><Badge status={e.status} small/></div>
     <div className="hist-meta">
      <span><Clock3 size={13} aria-hidden="true"/>Despachada às {formatClock(e.despachadoEm)}</span>
      {e.chegadaEm&&<span><MapPin size={13} aria-hidden="true"/>Chegou às {formatClock(e.chegadaEm)}{travel!=null&&travel>=0&&<> · {formatDuration(travel)} de deslocamento</>}</span>}
      {e.concluidoEm&&<span>{e.status==='CANCELADO'?'Cancelada':'Concluída'} às {formatClock(e.concluidoEm)}</span>}
      {!e.concluidoEm&&<span className="hist-live">Em andamento</span>}
     </div>
    </div>
   </li>;
  })}
 </ol>;
}
