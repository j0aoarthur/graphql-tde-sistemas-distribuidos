import {useState} from 'react';
import {Hourglass,MapPin,MapPinned,Navigation} from 'lucide-react';
import type {Dispatch,Incident,Snapshot,Vehicle} from '../../types';
import {Badge,Priority,SignalDot,VehicleTag} from '../../components/ui';
import {etaBrief} from '../../lib/eta';
import {formatAgo,formatDuration,useNow} from '../../lib/time';
import {vehicleActivity} from '../../lib/vehicle';

const WAITING=['RECEBIDA','AGUARDANDO_VIATURA'];
const byUrgency=(a:Incident,b:Incident)=>b.prioridade-a.prioridade||Date.parse(a.criadoEm)-Date.parse(b.criadoEm);
const FREE_PREVIEW=4;

function QueueCard({incident,dispatch,vehicle,paused,factor,now,onSelect}:{incident:Incident;dispatch?:Dispatch;vehicle?:Vehicle;paused:boolean;factor:number;now:number;onSelect:()=>void}){
 const waiting=WAITING.includes(incident.status),eta=etaBrief(dispatch,vehicle,paused,now,factor);
 return <button type="button" className="operation-row queue-card" data-level={incident.prioridade} data-waiting={waiting||undefined} onClick={onSelect}>
  <span className="queue-line">
   <strong className="queue-title">{incident.tipo}</strong>
   <Priority n={incident.prioridade}/>
  </span>
  <span className="queue-address"><MapPin size={13} aria-hidden="true"/><span>{incident.enderecoFormatado||incident.referencia||'Endereço não registrado'}</span></span>
  <span className="queue-line queue-foot">
   {waiting
    ?<span className="queue-wait"><Hourglass size={13} aria-hidden="true"/>Aguardando há {formatDuration((now-Date.parse(incident.criadoEm))/1000)}</span>
    :<><Badge status={incident.status} small/><span className="queue-vehicle-ref"><VehicleTag vehicle={vehicle} showPlate={false}/></span></>}
   {!waiting&&<span className={`queue-eta queue-eta--${eta.tone}`}>{eta.text}</span>}
   <span className="queue-ago">{formatAgo(incident.criadoEm,now)}</span>
  </span>
 </button>;
}

/** Fila do operador: o que precisa de ação (aguardando viatura) vem primeiro; o resto está só em andamento. */
export function AttendanceQueue({snapshot,onSelect,onOpenMap}:{snapshot:Snapshot;onSelect:(kind:'incident'|'vehicle',id:string)=>void;onOpenMap:()=>void}){
 const now=useNow(5000),[showAllFree,setShowAllFree]=useState(false);
 const{listarOcorrencias:incidents,listarViaturas:vehicles,listarDespachos:dispatches,estadoSimulacao:sim}=snapshot;
 const live=incidents.filter(o=>!['ENCERRADA','CANCELADA'].includes(o.status));
 const waiting=live.filter(o=>WAITING.includes(o.status)).sort(byUrgency),running=live.filter(o=>!WAITING.includes(o.status)).sort(byUrgency);
 const free=vehicles.filter(v=>v.status==='DISPONIVEL'),shownFree=showAllFree?free:free.slice(0,FREE_PREVIEW);
 const card=(o:Incident)=>{const d=dispatches.find(x=>x.ocorrenciaId===o.id);return <QueueCard key={o.id} incident={o} dispatch={d} vehicle={vehicles.find(v=>v.id===(d?.viaturaId??o.viaturaId))} paused={sim.pausada} factor={sim.fator} now={now} onSelect={()=>onSelect('incident',o.id)}/>;};
 return <div className="queue">
  <div className="queue-head"><h2>Fila de atendimento</h2><span className="queue-count" aria-label={`${live.length} ocorrências ativas`}>{live.length}</span></div>
  <p className="field-help">Mais urgente primeiro. Selecione uma ocorrência para ver detalhes.</p>
  {live.length===0&&<p className="queue-empty">Nenhuma ocorrência ativa no momento.</p>}
  {waiting.length>0&&<section aria-label="Aguardando viatura"><h3 className="queue-group queue-group--wait">Aguardando viatura <span>{waiting.length}</span></h3>{waiting.map(card)}</section>}
  {running.length>0&&<section aria-label="Em andamento"><h3 className="queue-group">Em andamento <span>{running.length}</span></h3>{running.map(card)}</section>}
  <button type="button" className="btn btn-outline btn-wide" onClick={onOpenMap}><MapPinned size={17}/> Explorar frota no mapa</button>
  <div className="queue-head queue-head--free"><h2>Viaturas livres</h2><span className="queue-count queue-count--ok">{free.length}</span></div>
  {free.length===0?<p className="queue-empty">Nenhuma viatura livre. Novas ocorrências ficam aguardando.</p>:<>
   <ul className="queue-free">{shownFree.map(v=><li key={v.id}><button type="button" className="queue-vehicle" onClick={()=>onSelect('vehicle',v.id)}><Navigation size={15} aria-hidden="true"/><VehicleTag vehicle={v}/><span className="queue-vehicle-meta">{vehicleActivity(v.status)}</span><SignalDot vehicle={v}/></button></li>)}</ul>
   {free.length>FREE_PREVIEW&&<button type="button" className="tl-toggle" aria-expanded={showAllFree} onClick={()=>setShowAllFree(x=>!x)}>{showAllFree?'Mostrar menos':`Mostrar todas (${free.length})`}</button>}
  </>}
 </div>;
}
