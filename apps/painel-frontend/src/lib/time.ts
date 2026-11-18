import {useEffect,useState} from 'react';
export const TZ='America/Bahia';

/**
 * Duração em texto curto e legível, com a precisão que importa em cada escala:
 *   45 s · 2 min 05 s · 5 h 12 min · 3 d 20 h
 * Nunca mostra "5557 min 33 s": acima de 1 h os segundos somem, acima de 1 dia os minutos também.
 */
export function formatDuration(seconds?:number|null){
 if(seconds==null||!Number.isFinite(seconds))return 'Indisponível';
 const total=Math.max(0,Math.round(seconds));
 if(total<60)return `${total} s`;
 const minutes=Math.floor(total/60);
 if(total<3600){const s=total%60;return s?`${minutes} min ${String(s).padStart(2,'0')} s`:`${minutes} min`;}
 const hours=Math.floor(minutes/60);
 if(total<86400){const m=minutes%60;return m?`${hours} h ${String(m).padStart(2,'0')} min`:`${hours} h`;}
 const days=Math.floor(hours/24),h=hours%24;
 return h?`${days} d ${h} h`:`${days} d`;
}

/** Tempo decorrido desde um instante, em linguagem natural ("agora", "há 5 min", "há 3 d"). */
export function formatAgo(raw?:string|null,now=Date.now()){
 if(!raw)return '—';
 const time=new Date(raw).getTime();if(Number.isNaN(time))return '—';
 const seconds=Math.max(0,Math.round((now-time)/1000));
 if(seconds<5)return 'agora';
 if(seconds<60)return `há ${seconds} s`;
 const minutes=Math.floor(seconds/60);
 if(minutes<60)return `há ${minutes} min`;
 const hours=Math.floor(minutes/60);
 if(hours<24)return `há ${hours} h`;
 const days=Math.floor(hours/24);
 return days===1?'ontem':`há ${days} d`;
}

const partsOf=(date:Date,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,...options}).format(date);
const dayKey=(date:Date)=>partsOf(date,{year:'numeric',month:'2-digit',day:'2-digit'});
/** Dia civil em America/Bahia como número inteiro, para comparar "hoje" e "ontem" sem depender do fuso do navegador. */
const dayNumber=(date:Date)=>{const[d,m,y]=dayKey(date).split('/').map(Number);return Date.UTC(y,m-1,d)/86400000;};
const daysBetween=(from:Date,to:Date)=>dayNumber(to)-dayNumber(from);

/** Horário de relógio no fuso de Feira de Santana. */
export function formatClock(raw?:string|null,withSeconds=false){
 if(!raw)return '—';const d=new Date(raw);if(Number.isNaN(d.getTime()))return '—';
 return partsOf(d,{hour:'2-digit',minute:'2-digit',...(withSeconds?{second:'2-digit'}:{})});
}

/** "Hoje, 14:32" · "Ontem, 09:10" · "12 nov, 18:05". */
export function formatMoment(raw?:string|null,now=Date.now()){
 if(!raw)return '—';const d=new Date(raw);if(Number.isNaN(d.getTime()))return '—';
 const diffDays=daysBetween(d,new Date(now));
 const clock=formatClock(raw);
 if(diffDays===0)return `Hoje, ${clock}`;
 if(diffDays===1)return `Ontem, ${clock}`;
 return `${partsOf(d,{day:'2-digit',month:'short'}).replace('.','').replace(' de ',' ')}, ${clock}`;
}

/** Rótulo de agrupamento por dia: "Hoje", "Ontem", "sexta-feira, 13 de novembro". */
export function formatDayLabel(raw:string,now=Date.now()){
 const d=new Date(raw);const diffDays=daysBetween(d,new Date(now));
 if(diffDays===0)return 'Hoje';if(diffDays===1)return 'Ontem';
 const text=partsOf(d,{weekday:'long',day:'numeric',month:'long'});return text.charAt(0).toUpperCase()+text.slice(1);
}
export const sameDay=(a:string,b:string)=>dayKey(new Date(a))===dayKey(new Date(b));

/** Re-renderiza o componente a cada `intervalMs` para manter tempos relativos "ao vivo". */
export function useNow(intervalMs=1000){
 const[now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),intervalMs);return()=>clearInterval(timer);},[intervalMs]);
 return now;
}
