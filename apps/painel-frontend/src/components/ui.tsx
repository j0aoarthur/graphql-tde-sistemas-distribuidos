import React from 'react';
import {ChevronRight,Radio,type LucideIcon} from 'lucide-react';
import {PRIORITIES} from '../lib/presentation';
import {signal} from './OperationsMap';
import {vehiclePlate,vehicleRef} from '../lib/vehicle';
import type {Vehicle} from '../types';
export type Tone='green'|'red'|'amber'|'blue'|'neutral';
export const STATUS:Record<string,{label:string;tone:Tone}>={
 DISPONIVEL:{label:'Disponível',tone:'green'},OCUPADA:{label:'Em deslocamento',tone:'red'},NO_LOCAL:{label:'No local',tone:'blue'},INDISPONIVEL:{label:'Reservada (demo)',tone:'neutral'},
 RECEBIDA:{label:'Recebida',tone:'amber'},AGUARDANDO_VIATURA:{label:'Aguardando viatura',tone:'amber'},
 DESPACHADA:{label:'Despachada',tone:'red'},EM_ATENDIMENTO:{label:'Em atendimento',tone:'blue'},
 ENCERRADA:{label:'Encerrada',tone:'green'},CANCELADA:{label:'Cancelada',tone:'neutral'},
 CANCELAMENTO_PENDENTE:{label:'Cancelamento pendente',tone:'amber'},ENCERRAMENTO_PENDENTE:{label:'Encerramento pendente',tone:'amber'},
 CONFIRMADO:{label:'Despacho confirmado',tone:'amber'},EM_DESLOCAMENTO:{label:'Em deslocamento',tone:'blue'},
 CONCLUIDO:{label:'Concluído',tone:'green'},CANCELADO:{label:'Cancelado',tone:'neutral'},
};
export const statusLabel=(status:string)=>STATUS[status]?.label??status.replaceAll('_',' ').toLowerCase();
export function Badge({status,small=false}:{status:string;small?:boolean}){const item=STATUS[status]??{label:statusLabel(status),tone:'neutral' as Tone};return <span className={`badge badge--${item.tone}${small?' badge--small':''}`}><span className="badge-dot"/>{item.label}</span>;}
export function Priority({n,compact=false}:{n:number;compact?:boolean}){const item=PRIORITIES.find(p=>p.value===n)??PRIORITIES[0];return <span className="priority" data-level={item.value} title={`Prioridade ${item.value} de 5 · ${item.label}`}><span className="priority-mark">{item.value}</span>{!compact&&item.label}</span>;}
export function RowAction({label,onClick}:{label:string;onClick:()=>void}){return <button className="icon-button table-action" aria-label={label} onClick={e=>{e.stopPropagation();onClick();}}><ChevronRight size={17}/></button>;}
export function Empty({icon:Icon=Radio,title,description}:{icon?:LucideIcon;title:string;description:string}){return <div className="empty"><div className="empty-icon"><Icon size={23}/></div><strong>{title}</strong><span>{description}</span></div>;}
export function SectionHeader({eyebrow,title,right}:{eyebrow?:string;title:string;right?:React.ReactNode}){return <div className="section-head"><div>{eyebrow&&<div className="section-eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>{right}</div>;}
/** Indicador de sinal GPS: ponto colorido + texto (nunca só cor). */
export function SignalDot({vehicle}:{vehicle:Vehicle}){const s=signal(vehicle);const tone=s==='Sinal OK'?'ok':s==='Sinal atrasado'?'warn':'off';return <span className={`signal signal--${tone}`}><i aria-hidden="true"/>{s}</span>;}
/** Identificação da viatura para o operador: número de referência em destaque, placa como apoio. */
export function VehicleTag({vehicle,showPlate=true}:{vehicle?:Vehicle;showPlate?:boolean}){
 if(!vehicle)return <span className="vehicle-tag vehicle-tag--empty">Sem viatura</span>;
 return <span className="vehicle-tag"><b>{vehicleRef(vehicle)}</b>{showPlate&&vehiclePlate(vehicle)&&<small>{vehiclePlate(vehicle)}</small>}</span>;
}
export const lengthText=(m?:number|null)=>{if(m==null||!Number.isFinite(m))return 'Calculando';return m>=1000?`${(m/1000).toFixed(1).replace('.',',')} km`:`${Math.round(m)} m`;};
