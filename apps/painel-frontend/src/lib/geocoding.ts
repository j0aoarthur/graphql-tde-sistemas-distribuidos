import type {LatLon} from '../types';
export type Place={point:LatLon;address:string;origin:string;precision:string;bairro?:string;cep?:string;numero?:string;complemento?:string};
const key=import.meta.env.VITE_MAPTILER_API_KEY;
const inArea=(p:number[])=>p.length===2&&p.every(Number.isFinite)&&p[1]>=-12.45&&p[1]<=-12.05&&p[0]>=-39.15&&p[0]<=-38.75;
function normalize(x:any):Place|null{
 const p=x.center??x.geometry?.coordinates;if(!Array.isArray(p)||!inArea(p))return null;
 const context=[x,...(Array.isArray(x.context)?x.context:[])];
 const part=(types:string[])=>context.find(c=>types.some(t=>c.id?.startsWith(t+'.')||c.place_type?.includes(t)))?.text;
 return {point:[p[1],p[0]],address:x.place_name??x.text??'',origin:'ENDERECO',precision:'APROXIMADA',bairro:part(['neighbourhood','neighborhood','quarter','suburb']),cep:part(['postal_code','postcode']),numero:typeof x.address==='string'?x.address:undefined};
}
export async function geocode(query:string,signal:AbortSignal,reverse=false):Promise<Place[]>{
 if(!key)throw Error('Busca indisponível. Selecione o pin e informe uma referência.');
 const url=new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`);url.searchParams.set('key',key);url.searchParams.set('language','pt');
 // Reverse accepts limit > 1 only with a single feature type. Do not reuse forward filters.
 if(reverse)url.searchParams.set('limit','1');else{url.searchParams.set('limit','6');url.searchParams.set('country','BR');url.searchParams.set('proximity','-38.966,-12.260');url.searchParams.set('bbox','-39.15,-12.45,-38.75,-12.05');}
 const response=await fetch(url,{signal});
 if(!response.ok)throw Error(response.status===429?'Limite de busca atingido. Informe uma referência para o pin.':response.status===401||response.status===403?'Acesso MapTiler recusado. Confira a chave e os domínios permitidos.':'Consulta de endereço indisponível. Informe uma referência para o pin.');
 const data=await response.json();return (Array.isArray(data.features)?data.features:[]).map(normalize).filter((p:Place|null):p is Place=>p!==null);
}
