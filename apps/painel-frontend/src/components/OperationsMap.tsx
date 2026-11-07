import {useEffect,useRef,useState} from 'react';
import * as maplibregl from 'maplibre-gl';
import type {Map as GLMap,GeoJSONSource} from 'maplibre-gl';
import type {Dispatch,Incident,LatLon,Vehicle} from '../types';
import 'maplibre-gl/dist/maplibre-gl.css';
import {interpolateSamples,remainingRoute,TELEMETRY_BUFFER_MS,type MotionSample} from '../lib/map-motion';
import {PRIORITIES} from '../lib/presentation';
import {Info,MapPin} from 'lucide-react';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
maplibregl.setWorkerUrl(workerUrl);
export const FEIRA:LatLon=[-12.260,-38.966];
const lnglat=(p:LatLon):[number,number]=>[p[1],p[0]];
export const signal=(v:Vehicle)=>!v.ultimoSinalEm?'Sem sinal':Date.now()-new Date(v.ultimoSinalEm).getTime()>30000?'Sem sinal':Date.now()-new Date(v.ultimoSinalEm).getTime()>10000?'Sinal atrasado':'Sinal OK';
export function along(points:LatLon[],progress:number):LatLon{
 const lengths=points.slice(1).map((p,i)=>Math.hypot((p[1]-points[i][1])*Math.cos(p[0]*Math.PI/180),p[0]-points[i][0]));
 let remaining=lengths.reduce((a,b)=>a+b,0)*Math.max(0,Math.min(1,progress));
 for(let i=0;i<lengths.length;i++){if(remaining<=lengths[i]&&lengths[i]>0){const t=remaining/lengths[i];return [points[i][0]+(points[i+1][0]-points[i][0])*t,points[i][1]+(points[i+1][1]-points[i][1])*t];}remaining-=lengths[i];}
 return points[points.length-1];
}
function geometry(value?:string|null):LatLon[]|null{try{const p=JSON.parse(value??'null');return Array.isArray(p)&&p.length>1&&p.every(x=>Array.isArray(x)&&x.length===2&&x.every(Number.isFinite))?p:null;}catch{return null;}}
function car(color:string){return `<svg viewBox="0 0 44 72" width="32" height="54" aria-hidden="true"><defs><linearGradient id="body${color.slice(1)}" x1="0" x2="1"><stop stop-color="#fff" stop-opacity=".8"/><stop offset=".25" stop-color="${color}"/><stop offset=".7" stop-color="${color}"/><stop offset="1" stop-color="#172534"/></linearGradient></defs><ellipse cx="24" cy="39" rx="20" ry="31" fill="#172534" opacity=".22"/><rect x="3" y="16" width="7" height="13" rx="2" fill="#172534"/><rect x="34" y="16" width="7" height="13" rx="2" fill="#172534"/><rect x="3" y="47" width="7" height="13" rx="2" fill="#172534"/><rect x="34" y="47" width="7" height="13" rx="2" fill="#172534"/><rect x="7" y="3" width="30" height="65" rx="11" fill="url(#body${color.slice(1)})" stroke="#172534" stroke-width="1.5"/><path d="M12 20Q22 14 32 20L30 31H14Z" fill="#142e43"/><rect x="14" y="33" width="16" height="16" rx="3" fill="${color}" stroke="#fff" stroke-opacity=".8"/><path d="M14 51H30L32 59Q22 64 12 59Z" fill="#142e43"/><path d="M10 9H17M27 9H34" stroke="#fff7cb" stroke-width="4"/><path d="M10 63H16M28 63H34" stroke="#c83335" stroke-width="3"/><path d="M18 36H26" stroke="white" stroke-width="3"/></svg>`;}
export function OperationsMap({vehicles,incidents,dispatches,selectedId,onSelect,onPick,pickMode=false,focus=null,showAllRoutes=false,zoom=13,compactLegend=false}:{vehicles:Vehicle[];incidents:Incident[];dispatches:Dispatch[];selectedId?:string;onSelect?:(kind:'vehicle'|'incident',id:string)=>void;onPick?:(point:LatLon)=>void;pickMode?:boolean;focus?:LatLon|null;showAllRoutes?:boolean;zoom?:number;compactLegend?:boolean}){
 const root=useRef<HTMLDivElement>(null),map=useRef<GLMap|null>(null),callbacks=useRef({onSelect,onPick,pickMode});callbacks.current={onSelect,onPick,pickMode};
 const markers=useRef(new Map<string,{marker:maplibregl.Marker;progress:number;route:string|null;frame:number;version:number;samples:MotionSample[];positionVersion:number;displayProgress:number}>());
 const picker=useRef<maplibregl.Marker|null>(null),styleReady=useRef(false);
 const[following,setFollowing]=useState(false),[age,setAge]=useState(0);
 useEffect(()=>{const timer=setInterval(()=>setAge(n=>n+1),2000);return()=>clearInterval(timer);},[]);
 const[ready,setReady]=useState(0),[dark,setDark]=useState(false),[error,setError]=useState('');
 const key=import.meta.env.VITE_MAPTILER_API_KEY;
 useEffect(()=>{
  if(!root.current)return;
  const style=import.meta.env.VITE_MAP_STYLE_URL||(key?`https://api.maptiler.com/maps/dataviz/style.json?key=${encodeURIComponent(key)}`:{version:8 as const,sources:{},layers:[{id:'background',type:'background' as const,paint:{'background-color':'#edf1f5'}}]});
  if(!key&&!import.meta.env.VITE_MAP_STYLE_URL)setError('Mapa base indisponível: configure o acesso MapTiler.');
  const m=new maplibregl.Map({container:root.current,style,center:lnglat(FEIRA),zoom,attributionControl:{compact:true}});map.current=m;
  if(root.current)root.current.dataset.zoom=String(m.getZoom());
  m.on('moveend',()=>{if(root.current)root.current.dataset.zoom=String(m.getZoom());});
  m.on('dragstart',()=>setFollowing(false));
  m.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
  m.on('style.load',()=>{styleReady.current=true;for(const layer of m.getStyle().layers??[]){if(layer.type==='fill-extrusion'||/poi|housenumber/i.test(layer.id))m.setLayoutProperty(layer.id,'visibility','none');if(layer.type==='line'&&/road.*minor|street.*minor/i.test(layer.id))m.setPaintProperty(layer.id,'line-color','#7c8794');}setReady(n=>n+1);});m.on('error',()=>setError('Mapa base indisponível. Verifique a conexão com MapTiler.'));
  m.on('zoom',()=>{for(const entry of markers.current.values())entry.marker.getElement().style.visibility=m.getZoom()<11?'hidden':'visible';});
  m.on('click',e=>{if(!callbacks.current.pickMode)return;const point:LatLon=[e.lngLat.lat,e.lngLat.lng];callbacks.current.onPick?.(point);});
  const resize=new ResizeObserver(()=>m.resize());resize.observe(root.current);
  return()=>{resize.disconnect();markers.current.forEach(x=>cancelAnimationFrame(x.frame));markers.current.clear();picker.current=null;m.remove();map.current=null;};
 },[]);
 useEffect(()=>{const m=map.current;if(!m||!key)return;styleReady.current=false;m.setStyle(dark?(import.meta.env.VITE_MAP_DARK_STYLE_URL||`https://api.maptiler.com/maps/dataviz-dark/style.json?key=${encodeURIComponent(key)}`):(import.meta.env.VITE_MAP_STYLE_URL||`https://api.maptiler.com/maps/dataviz/style.json?key=${encodeURIComponent(key)}`));},[dark]);
 useEffect(()=>{if(focus)map.current?.flyTo({center:lnglat(focus),zoom,duration:500});},[focus?.[0],focus?.[1],zoom]);
 useEffect(()=>{
  const m=map.current;if(!m||!pickMode||!focus)return;
  if(!picker.current){const el=document.createElement('div');el.className='incident-pin location-pin';el.textContent='!';el.setAttribute('aria-label','Local selecionado');picker.current=new maplibregl.Marker({element:el,draggable:true}).setLngLat(lnglat(focus)).addTo(m);picker.current.on('dragend',()=>{const p=picker.current!.getLngLat();callbacks.current.onPick?.([p.lat,p.lng]);});}
  picker.current.setLngLat(lnglat(focus));
 },[pickMode,focus?.[0],focus?.[1]]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready)return;
  const features=dispatches.filter(d=>!['CONCLUIDO','CANCELADO','NO_LOCAL'].includes(d.status)).flatMap(d=>{const points=geometry(d.rota);if(!points||(!showAllRoutes&&![d.id,d.viaturaId,d.ocorrenciaId].includes(selectedId??'')))return [];const selected=[d.id,d.viaturaId,d.ocorrenciaId].includes(selectedId??'');const remaining=remainingRoute(points,d.progresso);if(remaining.length<2)return [];return [{type:'Feature' as const,properties:{selected},geometry:{type:'LineString' as const,coordinates:remaining.map(lnglat)}}];});
  if(!styleReady.current)return;
  if(!m.getSource('routes')){m.addSource('routes',{type:'geojson',data:{type:'FeatureCollection',features:[]}});m.addLayer({id:'route-lines',type:'line',source:'routes',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#235fa4','line-width':['case',['get','selected'],8,6],'line-opacity':['case',['get','selected'],.95,.65]}});}
  (m.getSource('routes') as GeoJSONSource).setData({type:'FeatureCollection',features});
  if(!m.getSource('fleet-clusters')){
   m.addSource('fleet-clusters',{type:'geojson',data:{type:'FeatureCollection',features:[]},cluster:true,clusterRadius:44,clusterMaxZoom:10});
   m.addLayer({id:'clusters',type:'circle',source:'fleet-clusters',maxzoom:11,filter:['has','point_count'],paint:{'circle-color':'#235fa4','circle-radius':20,'circle-stroke-width':2,'circle-stroke-color':'#fff'}});
   if(m.getStyle().glyphs)m.addLayer({id:'cluster-count',type:'symbol',source:'fleet-clusters',maxzoom:11,filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-size':14},paint:{'text-color':'#fff'}});
   m.addLayer({id:'unclustered',type:'circle',source:'fleet-clusters',maxzoom:11,filter:['!', ['has','point_count']],paint:{'circle-color':['get','color'],'circle-radius':8,'circle-stroke-width':2,'circle-stroke-color':'#fff'}});
   m.on('click','clusters',e=>{const p=e.features?.[0]?.geometry as any;if(p?.coordinates)m.flyTo({center:p.coordinates,zoom:11.5});});
   m.on('click','unclustered',e=>{const p=e.features?.[0]?.properties;if(p)callbacks.current.onSelect?.(p.kind,p.entityId);});
  }
  (m.getSource('fleet-clusters') as GeoJSONSource).setData({type:'FeatureCollection',features:[...vehicles.map(v=>({type:'Feature' as const,properties:{kind:'vehicle',entityId:v.id,color:signal(v)!=='Sinal OK'?'#64748b':v.status==='DISPONIVEL'?'#08735a':'#235fa4'},geometry:{type:'Point' as const,coordinates:[v.longitude,v.latitude]}})),...incidents.filter(o=>!['ENCERRADA','CANCELADA'].includes(o.status)).map(o=>({type:'Feature' as const,properties:{kind:'incident',entityId:o.id,color:'#c83335'},geometry:{type:'Point' as const,coordinates:[o.longitude,o.latitude]}}))]});

  const ids=new Set<string>();
  for(const v of vehicles){
   ids.add(v.id);const old=markers.current.get(v.id);if(old&&old.version>v.versao)continue;
   const stale=signal(v)!=='Sinal OK',color=stale?'#64748b':v.status==='DISPONIVEL'?'#08735a':v.status==='NO_LOCAL'?'#69419c':'#235fa4';
   let entry=old;
   if(!entry){const el=document.createElement('button');el.type='button';el.className='vehicle-marker';el.onclick=e=>{e.stopPropagation();callbacks.current.onSelect?.('vehicle',v.id);};entry={marker:new maplibregl.Marker({element:el,rotationAlignment:'map'}).setLngLat([v.longitude,v.latitude]).addTo(m),progress:0,route:null,frame:0,version:v.versao,samples:[],positionVersion:-1,displayProgress:0};markers.current.set(v.id,entry);}
   const el=entry.marker.getElement();el.innerHTML=car(color);el.title=`${v.placa} · ${v.status==='DISPONIVEL'?'Em patrulha':v.status==='NO_LOCAL'?'No local':'Em deslocamento'} · ${signal(v)} · Último sinal: ${v.ultimoSinalEm??'Não recebido'}`;el.setAttribute('aria-label',el.title);el.style.visibility=m.getZoom()<11?'hidden':'visible';el.dataset.status=v.status;el.dataset.signal=signal(v);el.classList.toggle('selected',selectedId===v.id);
   const d=dispatches.find(x=>x.viaturaId===v.id&&!['CONCLUIDO','CANCELADO'].includes(x.status));const raw=d?.rota??v.patrulhaRota??null,points=geometry(raw),target=d?.progresso??v.patrulhaProgresso??0;
   const positionVersion=v.versaoPosicao??v.versao;
   const stop=stale||v.status==='NO_LOCAL'||matchMedia('(prefers-reduced-motion: reduce)').matches;
   if(stop){cancelAnimationFrame(entry.frame);entry.samples=[];entry.marker.setLngLat([v.longitude,v.latitude]).setRotation(v.direcaoGraus??0);}
   if(!stop&&entry.positionVersion!==positionVersion){
    const stamp=v.ultimaPosicaoEm?new Date(v.ultimaPosicaoEm).getTime():Date.now();
    const sample:MotionSample={time:Number.isFinite(stamp)?stamp:Date.now(),point:[v.latitude,v.longitude],route:points,raw,progress:target,heading:v.direcaoGraus??0};
    if(!entry.samples.length||sample.time>entry.samples.at(-1)!.time)entry.samples.push(sample);
    if(entry.samples.length>10)entry.samples.splice(0,entry.samples.length-10);
    cancelAnimationFrame(entry.frame);
    const frame=()=>{const state=interpolateSamples(entry!.samples,Date.now()-TELEMETRY_BUFFER_MS);entry!.marker.setLngLat(lnglat(state.point)).setRotation(state.heading);entry!.displayProgress=state.progress;if(Date.now()-TELEMETRY_BUFFER_MS<entry!.samples.at(-1)!.time)entry!.frame=requestAnimationFrame(frame);};
    if(entry.samples.length>1)entry.frame=requestAnimationFrame(frame);else entry.marker.setLngLat([v.longitude,v.latitude]).setRotation(v.direcaoGraus??0);
   }
   entry.progress=target;entry.route=raw;entry.version=v.versao;entry.positionVersion=positionVersion;

  }
  for(const o of incidents.filter(x=>!['ENCERRADA','CANCELADA'].includes(x.status))){ids.add(o.id);let entry=markers.current.get(o.id);if(!entry){const el=document.createElement('button');el.type='button';el.className='incident-pin';el.textContent='!';el.onclick=e=>{e.stopPropagation();callbacks.current.onSelect?.('incident',o.id);};entry={marker:new maplibregl.Marker({element:el}).setLngLat([o.longitude,o.latitude]).addTo(m),progress:0,route:null,frame:0,version:0,samples:[],positionVersion:-1,displayProgress:0};markers.current.set(o.id,entry);}entry.marker.setLngLat([o.longitude,o.latitude]);entry.marker.getElement().setAttribute('aria-label',`${o.tipo}, prioridade ${PRIORITIES[o.prioridade-1]?.label??o.prioridade}`);entry.marker.getElement().style.backgroundColor=PRIORITIES[o.prioridade-1]?.color??'#b42332';entry.marker.getElement().classList.toggle('selected',selectedId===o.id);}
  for(const [id,entry] of markers.current)if(!ids.has(id)){cancelAnimationFrame(entry.frame);entry.marker.remove();markers.current.delete(id);}
 },[vehicles,incidents,dispatches,selectedId,ready,showAllRoutes,age]);
 const selectedVehicle=vehicles.find(v=>v.id===selectedId);
 useEffect(()=>{if(following&&selectedVehicle)map.current?.easeTo({center:[selectedVehicle.longitude,selectedVehicle.latitude],duration:500});},[following,selectedVehicle?.latitude,selectedVehicle?.longitude]);
 return <div className={`map-shell ${pickMode?'map-shell--picking':''}`}><div ref={root} className="operations-map"/>{error&&<div className="map-warning" role="status">{error}</div>}<div className="map-controls"><button type="button" onClick={()=>map.current?.flyTo({center:lnglat(FEIRA),zoom:13})}>Centralizar cidade</button><button type="button" onClick={()=>setDark(x=>!x)}>{dark?'Tema claro':'Tema escuro'}</button>{selectedVehicle&&<button type="button" onClick={()=>setFollowing(x=>!x)}>{following?'Parar de acompanhar':'Acompanhar viatura'}</button>}</div>{selectedVehicle&&<div className="map-context"><strong>{selectedVehicle.placa}</strong> · {selectedVehicle.status==='DISPONIVEL'?'Em patrulha':selectedVehicle.status==='NO_LOCAL'?'No local':'Em deslocamento'} · {signal(selectedVehicle)}</div>}{pickMode?<div className="map-pick-help"><MapPin size={17}/><span>Clique para marcar o local · Arraste o pin para ajustar</span></div>:<details className={`map-legend ${compactLegend?'map-legend--compact':''}`} open={!compactLegend}><summary><Info size={16}/>Legenda</summary><div className="map-legend-items"><span><i style={{background:'#08735a'}}/>Disponível / patrulhando</span><span><i style={{background:'#235fa4'}}/>Em deslocamento</span><span><i style={{background:'#69419c'}}/>No local</span>{incidents.length>0&&<span><i style={{background:'#b42332'}}/>Ocorrência · cor por prioridade</span>}<span><i style={{background:'#64748b'}}/>Sinal atrasado / ausente</span></div></details>}</div>;
}
