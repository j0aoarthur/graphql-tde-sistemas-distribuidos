import React from 'react';
import {ChevronDown,CheckCheck,Gauge,MapPin,MapPinned,Pause,Play,Radio,Route,Truck,Users,X,ArrowRight} from 'lucide-react';
import type {Dispatch,EntitySelection,Incident,Snapshot,Vehicle,View} from '../../types';
import {ArrivalInfo} from '../../components/ArrivalInfo';
import {Badge,lengthText,Priority,SignalDot,VehicleTag} from '../../components/ui';
import {IncidentTimeline} from '../incidents/IncidentTimeline';
import {VehicleInsights} from '../vehicles/VehicleInsights';
import {formatAgo,formatDuration,formatMoment,useNow} from '../../lib/time';
import {vehicleActivity,vehiclePlate,vehicleRef} from '../../lib/vehicle';

export type DrawerAction='encerrar'|'cancelar'|'pauseDispatch';
type Props={selected:EntitySelection;snapshot:Snapshot;onClose:()=>void;onView:(view:View,focusId?:string)=>void;onSelect:(kind:'incident'|'vehicle'|'dispatch',id:string)=>void;onAction:(action:DrawerAction,id:string,value?:boolean)=>void;busy:boolean;demo:boolean};
const ENDED=['CONCLUIDO','CANCELADO'];
const KIND_LABEL={incident:'Ocorrência',vehicle:'Viatura',dispatch:'Despacho'} as const;

function Facts({items}:{items:{label:string;value:React.ReactNode}[]}){return <dl className="dw-facts">{items.map(i=><div key={i.label}><dt>{i.label}</dt><dd>{i.value}</dd></div>)}</dl>;}
function Progress({value,label}:{value:number;label:string}){const pct=Math.round(Math.max(0,Math.min(1,value))*100);return <div className="dw-progress"><div className="dw-progress-head"><span>{label}</span><b>{pct}%</b></div><div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{width:`${pct}%`}}/></div></div>;}
function Section({title,children,id}:{title:string;children:React.ReactNode;id:string}){return <section className="dw-section" aria-labelledby={id}><h3 id={id} className="dw-title">{title}</h3>{children}</section>;}
/** Dados de suporte (coordenadas, protocolo) ficam recolhidos: úteis para suporte, ruído para o operador. */
function Technical({children}:{children:React.ReactNode}){return <details className="dw-tech"><summary><ChevronDown size={14} aria-hidden="true"/>Dados técnicos</summary><div>{children}</div></details>;}
const coords=(lat:number,lon:number)=>`${lat.toFixed(5)}, ${lon.toFixed(5)}`;

export function EntityDrawer({selected,snapshot,onClose,onView,onSelect,onAction,busy,demo}:Props){
 const now=useNow(5000);
 if(!selected)return null;
 const incident=snapshot.listarOcorrencias.find(x=>x.id===selected.id),vehicle=snapshot.listarViaturas.find(x=>x.id===selected.id),dispatch=snapshot.listarDespachos.find(x=>x.id===selected.id);
 const data=selected.kind==='incident'?incident:selected.kind==='vehicle'?vehicle:dispatch;
 if(!data)return null;
 const active=(d:Dispatch)=>!ENDED.includes(d.status);
 const associated=selected.kind==='incident'?snapshot.listarDespachos.find(x=>x.ocorrenciaId===incident?.id):selected.kind==='vehicle'?snapshot.listarDespachos.find(x=>x.viaturaId===vehicle?.id&&active(x)):dispatch;
 const relatedIncident:Incident|undefined=selected.kind==='dispatch'?snapshot.listarOcorrencias.find(x=>x.id===dispatch?.ocorrenciaId):selected.kind==='vehicle'?snapshot.listarOcorrencias.find(x=>x.id===associated?.ocorrenciaId):incident;
 const relatedVehicle:Vehicle|undefined=selected.kind==='dispatch'?snapshot.listarViaturas.find(x=>x.id===dispatch?.viaturaId):vehicle??snapshot.listarViaturas.find(x=>x.id===incident?.viaturaId);
 const paused=snapshot.estadoSimulacao.pausada,factor=snapshot.estadoSimulacao.fator;
 const central=(id:string)=>snapshot.listarCentrais.find(x=>x.id===id)?.nome;

 let icon=<Radio size={22}/>,title='',subtitle:React.ReactNode=null,badges:React.ReactNode=null;
 if(selected.kind==='incident'&&incident){
  title=incident.tipo;
  subtitle=<span className="dw-sub"><MapPin size={14} aria-hidden="true"/>{incident.enderecoFormatado||incident.referencia||'Endereço não registrado'}</span>;
  badges=<><Priority n={incident.prioridade}/><Badge status={incident.status}/></>;
 }
 if(selected.kind==='vehicle'&&vehicle){
  icon=<Truck size={22}/>;title=vehicleRef(vehicle);
  subtitle=<span className="dw-sub dw-sub--wrap">{vehiclePlate(vehicle)&&<span className="plate-chip">{vehiclePlate(vehicle)}</span>}<span><Users size={14} aria-hidden="true"/>{vehicle.capacidade} {vehicle.capacidade===1?'ocupante':'ocupantes'}</span></span>;
  badges=<><Badge status={vehicle.status}/><SignalDot vehicle={vehicle}/></>;
 }
 if(selected.kind==='dispatch'&&dispatch){
  icon=<Route size={22}/>;title=relatedIncident?.tipo??'Despacho';
  subtitle=<span className="dw-sub dw-sub--wrap"><VehicleTag vehicle={relatedVehicle}/><ArrowRight size={14} aria-hidden="true"/><span>{relatedIncident?.enderecoFormatado||'Local da ocorrência'}</span></span>;
  badges=<Badge status={dispatch.status}/>;
 }

 return <div className="detail-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <aside className="detail-panel dw" aria-label={`Detalhes · ${KIND_LABEL[selected.kind]} · ${title}`}>
   <div className="detail-top dw-top"><span className="eyebrow">{KIND_LABEL[selected.kind].toUpperCase()}</span><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar detalhes"><X size={19}/></button></div>
   <div className="detail-main dw-body">
    <header className="dw-hero"><div className={`dw-hero-icon dw-hero-icon--${selected.kind}`} aria-hidden="true">{icon}</div><div className="dw-hero-text"><h2>{title}</h2>{subtitle}</div><div className="dw-badges">{badges}</div></header>

    {selected.kind==='incident'&&incident&&<>
     <p className="dw-opened">Aberta {formatAgo(incident.criadoEm,now)} · {formatMoment(incident.criadoEm,now)}</p>
     <Section id="dw-service" title="Atendimento">
      {associated?<>
       <button type="button" className="dw-link-card" onClick={()=>relatedVehicle&&onSelect('vehicle',relatedVehicle.id)} aria-label={`Abrir viatura ${vehicleRef(relatedVehicle)}`}><Truck size={18} aria-hidden="true"/><span><VehicleTag vehicle={relatedVehicle}/><Badge small status={associated.status}/></span><ArrowRight size={16} aria-hidden="true"/></button>
       <Progress value={associated.progresso} label="Progresso do trajeto"/>
       <div className="dw-eta"><ArrivalInfo dispatch={associated} vehicle={relatedVehicle} paused={paused} factor={factor}/></div>
       <Facts items={[{label:'Distância',value:lengthText(associated.distanciaMetros)},{label:'Duração estimada',value:associated.duracaoSegundos?formatDuration(associated.duracaoSegundos):'Calculando'}]}/>
      </>:<p className="dw-note">{['ENCERRADA','CANCELADA'].includes(incident.status)?'Sem viatura associada.':'Aguardando uma viatura livre. O despacho é automático assim que houver disponibilidade.'}</p>}
     </Section>
     <Section id="dw-place" title="Local e relato">
      <Facts items={[{label:'Referência',value:incident.referencia||'—'},{label:'Relato',value:incident.descricao||'—'},{label:'Central de origem',value:central(incident.centralId)??'—'}]}/>
     </Section>
     <Section id="dw-timeline" title="Linha do tempo"><IncidentTimeline dispatch={associated} vehicle={relatedVehicle} events={incident.eventos} paused={paused} factor={factor}/></Section>
     <Technical><Facts items={[{label:'Coordenadas',value:coords(incident.latitude,incident.longitude)},{label:'Protocolo',value:<code>{incident.id}</code>}]}/></Technical>
    </>}

    {selected.kind==='vehicle'&&vehicle&&<>
     <Section id="dw-now" title="Agora">
      {associated&&relatedIncident?<>
       <button type="button" className="dw-link-card" onClick={()=>onSelect('incident',relatedIncident.id)} aria-label={`Abrir ocorrência ${relatedIncident.tipo}`}><Radio size={18} aria-hidden="true"/><span><strong>{relatedIncident.tipo}</strong><small>{relatedIncident.enderecoFormatado||'Endereço não registrado'}</small></span><ArrowRight size={16} aria-hidden="true"/></button>
       <Progress value={associated.progresso} label="Progresso do trajeto"/>
       <div className="dw-eta"><ArrivalInfo dispatch={associated} vehicle={vehicle} paused={paused} factor={factor}/></div>
      </>:<p className="dw-note dw-note--ok"><Gauge size={15} aria-hidden="true"/>{vehicleActivity(vehicle.status)} · disponível para novas ocorrências.</p>}
      <Facts items={[{label:'Último sinal',value:vehicle.ultimoSinalEm?formatAgo(vehicle.ultimoSinalEm,now):'Aguardando telemetria'},{label:'Último movimento',value:vehicle.ultimoMovimentoEm?formatAgo(vehicle.ultimoMovimentoEm,now):'Sem movimento registrado'}]}/>
     </Section>
     <VehicleInsights vehicleId={vehicle.id} incidents={snapshot.listarOcorrencias} demo={demo}/>
     <Technical><Facts items={[{label:'Posição atual',value:coords(vehicle.latitude,vehicle.longitude)},{label:'Placa (registro)',value:vehicle.placa}]}/></Technical>
    </>}

    {selected.kind==='dispatch'&&dispatch&&<>
     <Section id="dw-trip" title="Deslocamento">
      <Progress value={dispatch.progresso} label="Rota percorrida"/>
      <div className="dw-eta"><ArrivalInfo dispatch={dispatch} vehicle={relatedVehicle} paused={paused} factor={factor}/></div>
      {!dispatch.rota&&!ENDED.includes(dispatch.status)&&<p className="dw-note">Calculando a rota pelas ruas…</p>}
     </Section>
     <Section id="dw-summary" title="Resumo">
      <Facts items={[{label:'Iniciado',value:formatMoment(dispatch.criadoEm,now)},{label:'Concluído',value:dispatch.concluidoEm?formatMoment(dispatch.concluidoEm,now):'Em andamento'},{label:'Distância',value:lengthText(dispatch.distanciaMetros)}]}/>
      <div className="dw-links">
       {relatedIncident&&<button type="button" className="btn btn-outline" onClick={()=>onSelect('incident',relatedIncident.id)}><Radio size={15}/>Ver ocorrência</button>}
       {relatedVehicle&&<button type="button" className="btn btn-outline" onClick={()=>onSelect('vehicle',relatedVehicle.id)}><Truck size={15}/>Ver viatura</button>}
      </div>
     </Section>
     <Technical><Facts items={[{label:'Protocolo do despacho',value:<code>{dispatch.id}</code>}]}/></Technical>
    </>}
   </div>

   <div className="detail-actions dw-actions">
    {selected.kind==='incident'&&incident&&<>
     {['DESPACHADA','EM_ATENDIMENTO'].includes(incident.status)&&<button type="button" disabled={busy} className="btn btn-primary btn-wide" onClick={()=>onAction('encerrar',incident.id)}><CheckCheck size={16}/> Encerrar atendimento</button>}
     {!['ENCERRADA','CANCELADA','CANCELAMENTO_PENDENTE','ENCERRAMENTO_PENDENTE'].includes(incident.status)&&<button type="button" disabled={busy} className="btn btn-danger-outline btn-wide" onClick={()=>onAction('cancelar',incident.id)}><X size={16}/> Cancelar ocorrência</button>}
    </>}
    {selected.kind==='dispatch'&&dispatch&&!['CONCLUIDO','CANCELADO','NO_LOCAL'].includes(dispatch.status)&&<button type="button" disabled={busy} className="btn btn-outline btn-wide" onClick={()=>onAction('pauseDispatch',dispatch.id,!dispatch.simulacaoPausada)}>{dispatch.simulacaoPausada?<Play size={16}/>:<Pause size={16}/>} {dispatch.simulacaoPausada?'Retomar viatura':'Pausar viatura'}</button>}
    <button type="button" className="btn btn-outline btn-wide" onClick={()=>{onView('map',selected.kind==='vehicle'?vehicle!.id:associated?.id??selected.id);onClose();}}><MapPinned size={16}/> Ver no mapa operacional</button>
   </div>
   {demo&&<div className="demo-detail-note">Prévia visual — operações não são persistidas no servidor.</div>}
  </aside>
 </div>;
}
