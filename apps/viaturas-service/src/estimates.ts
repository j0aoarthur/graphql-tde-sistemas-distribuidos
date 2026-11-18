import { BadRequestException } from '@nestjs/common';
export function area(latitude:number,longitude:number){return Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=-12.45&&latitude<=-12.05&&longitude>=-39.15&&longitude<=-38.75;}
export async function forecast(db:any,latitude:number,longitude:number){
 if(!area(latitude,longitude))throw new BadRequestException('Ponto fora da área de operação');
 const calculadoEm=new Date().toISOString();
 const unavailable={calculadoEm,qualidadeEstimativa:'INDISPONIVEL',origemEstimativa:'OSRM'};
 const candidates=await db.viatura.findMany({where:{status:'DISPONIVEL',ultimoSinalEm:{gte:new Date(Date.now()-30000)},turnos:{some:{fimEm:null}}},orderBy:{id:'asc'},take:50});
 if(!candidates.length)return unavailable;
 try{
  const coordinates=[...candidates.map((v:any)=>`${v.longitude},${v.latitude}`),`${longitude},${latitude}`].join(';');
  const url=`${process.env.OSRM_URL??'http://localhost:5000'}/table/v1/driving/${coordinates}?sources=${candidates.map((_:any,i:number)=>i).join(';')}&destinations=${candidates.length}&annotations=duration,distance`;
  const response=await fetch(url,{signal:AbortSignal.timeout(4000)});if(!response.ok)return unavailable;
  const data=await response.json() as any;if(data.code!=='Ok')return unavailable;
  const valid=candidates.map((v:any,i:number)=>({viaturaCandidataId:v.id,duracaoViariaSegundos:data.durations?.[i]?.[0],distanciaMetros:data.distances?.[i]?.[0]})).filter((v:any)=>Number.isFinite(v.duracaoViariaSegundos)&&Number.isFinite(v.distanciaMetros)).sort((a:any,b:any)=>a.duracaoViariaSegundos-b.duracaoViariaSegundos||a.viaturaCandidataId.localeCompare(b.viaturaCandidataId));
  return valid.length?{...valid[0],calculadoEm,qualidadeEstimativa:'ROTEAVEL',origemEstimativa:'OSRM'}:unavailable;
 }catch{return unavailable;}
}
export function dayRange(value?:string){
 const date=value??new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new BadRequestException('Data inválida');
 const from=new Date(`${date}T00:00:00-03:00`);if(!Number.isFinite(from.getTime())||from.toISOString().slice(0,10)!==date)throw new BadRequestException('Data inválida');
 return {gte:from,lt:new Date(from.getTime()+86400000)};
}
