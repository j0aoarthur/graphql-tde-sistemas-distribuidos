import {useEffect,useMemo} from 'react';
import {MapContainer,TileLayer,Marker,Popup,Polyline,useMap,useMapEvents,ZoomControl} from 'react-leaflet';
import L from 'leaflet';
import type {Dispatch,Incident,LatLon,Vehicle} from '../types';
import 'leaflet/dist/leaflet.css';
export const FEIRA:LatLon=[-12.260,-38.966];
function icon(kind:'vehicle'|'incident',status:string,selected=false){
 const vehicle=kind==='vehicle',active=status==='DISPONIVEL',arrived=status==='NO_LOCAL';
 const color=vehicle?(active?'#168a71':arrived?'#bd773d':'#ce4739'):'#ce4739';
 return L.divIcon({className:'sdv-leaflet-marker',html:`<div class="map-pin ${selected?'is-selected':''}" style="--pin:${color}"><span>${vehicle?'🚓':'!'}</span></div>`,iconSize:[36,40],iconAnchor:[18,35]});
}
function Picker({onPick}:{onPick:(x:LatLon)=>void}){useMapEvents({click(e){onPick([e.latlng.lat,e.latlng.lng]);}});return null;}
function Focus({point,zoom=14}:{point:LatLon|null;zoom?:number}){const map=useMap();useEffect(()=>{if(point)map.flyTo(point,zoom,{duration:.55});},[map,point?.[0],point?.[1],zoom]);return null;}
function Bounds({route}:{route:LatLon[]|null}){const map=useMap();useEffect(()=>{if(route&&route.length>1){map.fitBounds(L.latLngBounds(route),{padding:[65,65],maxZoom:15,animate:true});}},[map,route?.length,route?.[0]?.join(',')]);return null;}
export function OperationsMap({vehicles,incidents,dispatches,selectedId,onSelect,onPick,pickMode=false,focus=null,showAllRoutes=false,zoom=13}:{
 vehicles:Vehicle[];incidents:Incident[];dispatches:Dispatch[];selectedId?:string;onSelect?:(kind:'vehicle'|'incident',id:string)=>void;onPick?:(point:LatLon)=>void;pickMode?:boolean;focus?:LatLon|null;showAllRoutes?:boolean;zoom?:number;
}){
 const routes=useMemo(()=>dispatches.filter(d=>d.rota&& !['CONCLUIDO','CANCELADO'].includes(d.status)).map(d=>{
  try{const parsed=JSON.parse(d.rota!) as LatLon[];if(Array.isArray(parsed)&&parsed.length>=2&&parsed.every(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])))return {...d,coordinates:parsed};}catch{}return null;
 }).filter((x):x is Dispatch&{coordinates:LatLon[]}=>x!==null),[dispatches]);
 const selectedRoute=routes.find(d=>d.id===selectedId||d.ocorrenciaId===selectedId||d.viaturaId===selectedId)?.coordinates??null;
 return <MapContainer center={FEIRA} zoom={zoom} zoomControl={false} scrollWheelZoom={true} className="operations-map" style={{height:'100%',width:'100%'}}>
  <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url={import.meta.env.VITE_MAP_TILE_URL||'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}/>
  <ZoomControl position="bottomright"/>
  {pickMode&&onPick&&<Picker onPick={onPick}/>}
  <Focus point={focus} zoom={zoom}/>
  {selectedRoute&&<Bounds route={selectedRoute}/>}
  {routes.filter(d=>showAllRoutes||[d.id,d.ocorrenciaId,d.viaturaId].includes(selectedId||'')).map(d=><Polyline key={d.id} positions={d.coordinates} pathOptions={{color:'#e34a3a',weight:5,opacity:.85,dashArray:d.id===selectedId?undefined:'12 7'}}/>)}
  {vehicles.map(v=><Marker key={v.id} position={[v.latitude,v.longitude]} icon={icon('vehicle',v.status,selectedId===v.id)} eventHandlers={{click:()=>onSelect?.('vehicle',v.id)}}><Popup><strong>{v.placa}</strong><div>{v.status.replaceAll('_',' ')}</div></Popup></Marker>)}
  {incidents.filter(o=>!['ENCERRADA','CANCELADA'].includes(o.status)).map(o=><Marker key={o.id} position={[o.latitude,o.longitude]} icon={icon('incident',o.status,selectedId===o.id)} eventHandlers={{click:()=>onSelect?.('incident',o.id)}}><Popup><strong>{o.tipo}</strong><div>Prioridade {o.prioridade} · {o.status}</div></Popup></Marker>)}
 </MapContainer>;
}
